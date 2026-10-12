-- UNAPPLIED PROPOSAL. Requires Stages 1 -> 2 -> 3 -> 4 -> 5 -> 6.
begin;
-- Replay checks run after HMAC verification but before expensive gateway fetching.
create function public.cv_gateway_event_seen(p_event text,p_fingerprint text,p_payment text) returns boolean language plpgsql security definer set search_path='' as $$
 declare e public.cv_gateway_observations;
 begin
 if p_event is null or length(p_event) not between 1 and 200 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_payment is null or p_payment !~ '^pay_[A-Za-z0-9]{1,80}$' then raise exception 'Invalid event reference';end if;
 select * into e from public.cv_gateway_observations where event_reference=p_event;
 if found then if e.fingerprint<>p_fingerprint or e.payment_id<>p_payment then raise exception 'Conflicting event identity';end if;return true;end if;
 return exists(select 1 from public.cv_gateway_observations where fingerprint=p_fingerprint and payment_id=p_payment);
 end $$;
create index cv_gateway_observation_fingerprint on public.cv_gateway_observations(fingerprint,payment_id);
-- Database budgets cannot be bypassed through another application instance.
create table public.cv_request_budgets(key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),window_start timestamptz not null,requests integer not null check(requests>=0),primary key(key_hash,window_start));
alter table public.cv_request_budgets enable row level security;
revoke all on public.cv_request_budgets from public,anon,authenticated,service_role;
create function public.cv_consume_request_budget(p_key text,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$
 declare boundary timestamptz:=date_trunc('minute',public.cv_billing_now());used integer;
 begin
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 120 then raise exception 'Invalid request budget';end if;
 insert into public.cv_request_budgets(key_hash,window_start,requests) values(p_key,boundary,1)
 on conflict(key_hash,window_start) do update set requests=public.cv_request_budgets.requests+1 where public.cv_request_budgets.requests<p_limit returning requests into used;
 return used is not null;
 end $$;
-- Privacy-preserving bounded operational cleanup; no financial evidence is removed.
create function public.cv_prune_request_budgets() returns integer language plpgsql security definer set search_path='' as $$
 declare removed integer;
 begin with old as (select key_hash,window_start from public.cv_request_budgets where window_start<public.cv_billing_now()-interval '1 day' limit 5000),gone as (delete from public.cv_request_budgets b using old where b.key_hash=old.key_hash and b.window_start=old.window_start returning 1) select count(*) into removed from gone;return removed;end $$;
revoke execute on function public.cv_gateway_event_seen(text,text,text),public.cv_consume_request_budget(text,integer),public.cv_prune_request_budgets() from public,anon,authenticated,service_role;
grant execute on function public.cv_gateway_event_seen(text,text,text),public.cv_consume_request_budget(text,integer),public.cv_prune_request_budgets() to service_role;
-- Bound quote creation through both application and direct authenticated RPC paths.
create index cv_billing_quote_actor_time on public.cv_billing_quotes(requested_by,created_at);
create function public.cv_quote_budget_guard() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 -- Serialize actor-wide budget across multiple organizations without holding a global lock.
 perform pg_advisory_xact_lock(hashtextextended(new.requested_by::text,771));
 if (select count(*) from public.cv_billing_quotes where requested_by=new.requested_by and created_at>public.cv_billing_now()-interval '1 hour')>=120 then raise exception 'Quote request budget exceeded';end if;return new;end $$;
create trigger cv_quote_budget before insert on public.cv_billing_quotes for each row execute function public.cv_quote_budget_guard();
revoke execute on function public.cv_quote_budget_guard() from public,anon,authenticated,service_role;
create or replace function public.cv_process_gateway_payment(p_order text,p_payment text,p_amount bigint,p_currency text,p_status text,p_refunded bigint,p_event text,p_fingerprint text,p_disputed boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t public.cv_gateway_attempts;q public.cv_billing_quotes;a uuid;prior public.cv_gateway_observations;settled public.cv_paid_settlements;o public.cv_offers;period uuid;start_time timestamptz;is_review boolean;
 begin
 select account_id into a from public.cv_gateway_attempts where order_id=p_order;if a is null then raise exception 'Unknown gateway order';end if;
 perform 1 from public.accounts where id=a for update;
 select * into t from public.cv_gateway_attempts where order_id=p_order for update;
 select * into q from public.cv_billing_quotes where id=t.quote_id for update;
 if p_payment is null or p_amount is null or p_currency is null or p_status is null or p_refunded is null or p_event is null or p_fingerprint is null or p_disputed is null or p_payment !~ '^pay_[A-Za-z0-9]{1,80}$' or p_amount<>t.amount_minor or p_currency<>t.currency or p_status not in ('created','authorized','captured','failed','refunded') or p_refunded not between 0 and p_amount or (p_status='refunded' and p_refunded<>p_amount) or ((p_refunded>0 or p_disputed) and p_status not in ('captured','refunded')) or length(p_event) not between 1 and 200 or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Verified payment mismatch';end if;
 select * into prior from public.cv_gateway_observations where event_reference=p_event or (fingerprint=p_fingerprint and payment_id=p_payment) order by occurred_at limit 1;
 if found then if prior.attempt_id<>t.id or prior.payment_id<>p_payment or prior.fingerprint<>p_fingerprint then raise exception 'Event identity conflict';end if;return jsonb_build_object('state',t.state,'duplicate',true);end if;
 insert into public.cv_gateway_observations(attempt_id,event_reference,fingerprint,payment_id,snapshot) values(t.id,p_event,p_fingerprint,p_payment,jsonb_build_object('status',p_status,'amount_minor',p_amount,'currency',p_currency,'refunded_minor',p_refunded,'disputed',p_disputed));
 if t.captured_payment_id is not null and t.captured_payment_id<>p_payment then
 if p_status in ('captured','refunded') then perform public.cv_billing_event(a,t.requested_by,'payment.extra_capture_review',t.id,jsonb_build_object('payment_id',p_payment));end if;
 return jsonb_build_object('state',t.state,'review',p_status in ('captured','refunded'));
 end if;
 if p_status in ('created','authorized','failed') and not p_disputed then
 if t.captured_payment_id is null then update public.cv_gateway_attempts set state=case when p_status='created' then state when p_status='authorized' and state<>'failed' then 'authorized' when p_status='failed' then 'failed' else state end where id=t.id;end if;
 perform public.cv_billing_event(a,t.requested_by,'payment.'||p_status,t.id);return jsonb_build_object('state',p_status);
 end if;
 select * into settled from public.cv_paid_settlements where attempt_id=t.id;
 if settled.attempt_id is null then
 is_review:=not public.cv_account_enabled(a) or q.status<>'awaiting_payment' or t.expires_at<=public.cv_billing_now() or q.seats<public.cv_allocated_seats(a)
 or not exists(select 1 from public.account_members where account_id=a and user_id=t.requested_by and status='active' and role='owner')
 or q.base_period_id is distinct from (select id from public.cv_billing_periods where account_id=a order by starts_at desc limit 1)
 or p_status='refunded' or p_refunded>0 or p_disputed;
 if q.new_redemption then
 select * into o from public.cv_offers where id=(select offer_id from public.cv_payment_offer_reservations where attempt_id=t.id) for update;
 if o.id is null or not exists(select 1 from public.cv_payment_offer_reservations where attempt_id=t.id and expires_at>public.cv_billing_now()) then is_review:=true;end if;
 end if;
 update public.cv_gateway_attempts set captured_payment_id=p_payment,state=case when is_review then 'review' else 'captured' end where id=t.id;
 insert into public.cv_paid_settlements(attempt_id,quote_id,state) values(t.id,q.id,case when is_review then 'review' else 'scheduled' end);
 if not is_review then
 if q.new_redemption then insert into public.cv_offer_redemptions(offer_id,account_id,offer_version_id,quote_id) values(o.id,a,q.offer_version_id,q.id);update public.cv_offers set redemption_count=redemption_count+1 where id=o.id;end if;
 start_time:=greatest(public.cv_billing_now(),coalesce((select max(ends_at) from public.cv_billing_periods where account_id=a),public.cv_billing_now()));
 update public.cv_billing_quotes set status='scheduled',grant_kind='paid',grant_reason='Verified captured Razorpay test payment',scheduled_for=start_time where id=q.id;
 period:=public.cv_materialize_billing_quote(q.id);
 elsif q.status='awaiting_payment' then update public.cv_billing_quotes set status='needs_review' where id=q.id;
 end if;
 insert into public.cv_payment_events(intent_id,provider,event_reference,status,amount_minor,currency) values(t.intent_id,'razorpay',p_payment,'paid',t.amount_minor,t.currency);
 perform public.cv_billing_event(a,t.requested_by,case when is_review then 'payment.capture_needs_review' else 'payment.captured' end,t.id,jsonb_build_object('payment_id',p_payment,'period_id',period));
 end if;
 if p_refunded>t.refunded_minor or p_disputed then
 update public.cv_gateway_attempts set refunded_minor=greatest(refunded_minor,p_refunded),state=case when p_disputed then 'disputed' when state in ('reversed','disputed') then state when p_refunded=p_amount then 'refunded' else state end where id=t.id;
 if p_refunded=p_amount or p_disputed then
 update public.cv_paid_settlements set state=case when p_disputed then 'disputed' else 'refunded' end where attempt_id=t.id;
 update public.cv_billing_quotes set status='cancelled' where id=q.id and status='scheduled';
 end if;
 perform public.cv_billing_event(a,t.requested_by,case when p_disputed then 'payment.disputed' else 'payment.refund_observed' end,t.id,jsonb_build_object('refunded_minor',p_refunded,'full',p_refunded=p_amount));
 end if;
 delete from public.cv_payment_offer_reservations where attempt_id=t.id;
 return jsonb_build_object('state',(select state from public.cv_gateway_attempts where id=t.id),'period_id',(select period_id from public.cv_paid_settlements where attempt_id=t.id));
 end $$;


create table public.cv_reconciliation_checks(attempt_id uuid primary key references public.cv_gateway_attempts(id),last_checked_at timestamptz not null);
alter table public.cv_reconciliation_checks enable row level security;
revoke all on public.cv_reconciliation_checks from public,anon,authenticated,service_role;
create function public.cv_reconciliation_candidates() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from(select t.id,t.order_id from public.cv_gateway_attempts t left join public.cv_reconciliation_checks c on c.attempt_id=t.id
 where t.order_id is not null and t.state not in ('refunded','reversed','disputed') and (t.created_at>public.cv_billing_now()-interval '90 days' or t.state in ('preparing','ready','authorized','failed','review'))
 and (c.last_checked_at is null or c.last_checked_at<public.cv_billing_now()-case when t.state='captured' then interval '6 hours' else interval '5 minutes' end)
 order by c.last_checked_at nulls first,t.created_at limit 20) x $$;
create function public.cv_note_reconciliation(p_attempt uuid) returns boolean language plpgsql security definer set search_path='' as $$
 begin insert into public.cv_reconciliation_checks values(p_attempt,public.cv_billing_now()) on conflict(attempt_id) do update set last_checked_at=excluded.last_checked_at;return true;end $$;
revoke execute on function public.cv_reconciliation_candidates(),public.cv_note_reconciliation(uuid) from public,anon,authenticated,service_role;
grant execute on function public.cv_reconciliation_candidates(),public.cv_note_reconciliation(uuid) to service_role;
create function public.cv_record_payment_admin_action(p_action text,p_attempt uuid,p_reference text) returns boolean language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin();a uuid;
 begin
 if p_action is null or p_action not in ('reconcile','bind_order') or p_reference is null or p_reference !~ '^(pay|order)_[A-Za-z0-9]{1,80}$'
 or (p_action='reconcile' and p_reference !~ '^pay_') or (p_action='bind_order' and (p_attempt is null or p_reference !~ '^order_')) then raise exception 'Invalid financial audit request';end if;
 if p_attempt is not null then select account_id into a from public.cv_gateway_attempts where id=p_attempt;if not found then raise exception 'Payment attempt unavailable';end if;end if;
 perform public.cv_billing_event(a,actor,'payment.admin_'||p_action||'_requested',p_attempt,jsonb_build_object('gateway_reference',p_reference));return true;
 end $$;
revoke execute on function public.cv_record_payment_admin_action(text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.cv_record_payment_admin_action(text,uuid,text) to authenticated;
commit;
