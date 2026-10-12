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

-- Cancellation cannot discard a captured future period without a reviewed refund.
create or replace function public.cv_subscription_action(p_action text,p_request uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_account();
 begin
 perform 1 from public.accounts where id=a for update;
 if not exists(select 1 from public.account_members where account_id=a and user_id=auth.uid() and status='active' and role='owner') then raise exception 'Owner required' using errcode='42501';end if;
 if p_action='resume_renewal' and not public.cv_account_enabled(a) then raise exception 'Suspended account cannot resume renewal';end if;
 insert into public.cv_subscriptions(account_id) values(a) on conflict do nothing;
 if p_action='cancel_request' then
 if exists(select 1 from public.cv_paid_settlements paid join public.cv_billing_quotes q on q.id=paid.quote_id where q.id=p_request and q.account_id=a and paid.state<>'refunded') then raise exception 'Paid requests require reviewed refund handling';end if;
 update public.cv_billing_quotes set status='cancelled' where id=p_request and account_id=a and status in ('quoted','awaiting_payment','scheduled','needs_review');if not found then raise exception 'Request cannot be cancelled';end if;
 elsif p_action in ('cancel_renewal','resume_renewal') then
 update public.cv_subscriptions set cancel_at_period_end=(p_action='cancel_renewal'),revision=revision+1 where account_id=a;
 if p_action='cancel_renewal' then update public.cv_billing_quotes set status='cancelled' where account_id=a and status in ('scheduled','awaiting_payment') and not exists(select 1 from public.cv_paid_settlements paid where paid.quote_id=public.cv_billing_quotes.id and paid.state in ('scheduled','active','review','disputed','reversed'));end if;
 else raise exception 'Unsupported subscription action';end if;
 perform public.cv_billing_event(a,auth.uid(),'billing.'||p_action,p_request);return true;
 end $$;


create or replace function public.cv_materialize_billing_quote(p_quote uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare r public.cv_billing_quotes;t jsonb;p uuid;start_time timestamptz;ending timestamptz;trial integer;sub public.cv_subscriptions;
 begin
 select * into r from public.cv_billing_quotes where id=p_quote for update;
 if r.status<>'scheduled' or r.scheduled_for>public.cv_billing_now() then return null;end if;
 if r.seats<public.cv_allocated_seats(r.account_id) then update public.cv_billing_quotes set status='needs_review' where id=r.id;perform public.cv_billing_event(r.account_id,r.accepted_by,'billing.change_needs_review',r.id);return null;end if;
 if r.grant_kind='paid' and not exists(select 1 from public.cv_paid_settlements where quote_id=r.id and state='scheduled') then raise exception 'Verified settlement required';end if;
 t:=r.quote->'plan';start_time:=r.scheduled_for;trial:=(r.quote->>'trial_days')::integer;
 ending:=case when trial>0 then start_time+make_interval(days=>trial) else public.cv_period_end(start_time,t) end;
 if exists(select 1 from public.cv_billing_periods where account_id=r.account_id and starts_at<ending and ends_at>start_time) then raise exception 'Overlapping billing periods forbidden';end if;
 insert into public.cv_billing_periods(account_id,plan_version_id,plan_snapshot,starts_at,ends_at,licensed_seats,certificate_limit,list_amount_minor,amount_due_minor,currency,offer_version_id,access_kind,payment_status,created_by)
 values(r.account_id,r.plan_version_id,t,start_time,ending,r.seats,(t->>'certificate_limit')::bigint,(r.quote->>'list_amount_minor')::bigint,case when r.grant_kind='paid' then (r.quote->>'amount_due_minor')::bigint else 0 end,r.quote->>'currency',r.offer_version_id,
 case when r.grant_kind='paid' then 'paid' when r.grant_kind='complimentary' then 'complimentary' when trial>0 then 'trial' else 'free' end,case when r.grant_kind='paid' then 'captured' when r.grant_kind='complimentary' then 'waived' else 'no_payment_required' end,r.accepted_by) returning id into p;
 insert into public.cv_period_usage(period_id) values(p);
 if r.grant_kind='paid' then update public.cv_paid_settlements set period_id=p,state='active' where quote_id=r.id and state='scheduled';if not found then raise exception 'Verified settlement required';end if;end if;
 select * into sub from public.cv_subscriptions where account_id=r.account_id for update;
 update public.cv_subscriptions set trial_used=trial_used or trial>0,cancel_at_period_end=case when r.grant_kind='paid' then sub.cancel_at_period_end else false end,revision=revision+1,
 promotion_version_id=case when r.new_redemption then r.offer_version_id when r.intent in ('start','change','trial') then null else promotion_version_id end,
 promotion_cycles_remaining=case when r.new_redemption then greatest(0,coalesce((r.quote->'offer_terms'->>'cycles')::integer,0)-1) when r.offer_version_id is not null then greatest(0,promotion_cycles_remaining-1) when r.intent in ('start','change','trial') then 0 else promotion_cycles_remaining end where account_id=r.account_id;
 update public.cv_billing_quotes set status='applied' where id=r.id;
 perform public.cv_billing_event(r.account_id,r.accepted_by,'billing.period_started',p,jsonb_build_object('quote_id',r.id,'access_kind',r.grant_kind,'reason',r.grant_reason,'plan_version_id',r.plan_version_id));return p;
 end $$;



-- Gateway precision must come from immutable quote terms, never the checkout browser.
create or replace function public.cv_prepare_checkout(p_intent uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_owner();i public.cv_payment_intents;q public.cv_billing_quotes;t public.cv_gateway_attempts;o public.cv_offers;n integer;new_id uuid:=gen_random_uuid();
 begin
 select * into i from public.cv_payment_intents where id=p_intent and account_id=a;if not found then raise exception 'Payment intent unavailable';end if;
 select * into q from public.cv_billing_quotes where id=i.quote_id for update;
 select * into t from public.cv_gateway_attempts where intent_id=i.id;
 if found then return jsonb_build_object('id',t.id,'state',t.state,'order_id',t.order_id,'amount_minor',t.amount_minor,'currency',t.currency,'currency_exponent',(q.quote->'plan'->>'currency_exponent')::integer,'expires_at',t.expires_at,'create_order',false);end if;
 if q.requested_by<>auth.uid() or q.status<>'awaiting_payment' or q.expires_at<=public.cv_billing_now() or q.seats<public.cv_allocated_seats(a)
 or q.base_period_id is distinct from (select id from public.cv_billing_periods where account_id=a order by starts_at desc limit 1) then raise exception 'Checkout quote no longer valid';end if;
 if q.intent<>'renewal' and (not exists(select 1 from public.cv_plans p join public.cv_plan_versions v on v.plan_id=p.id where v.id=q.plan_version_id and p.status='active') or (q.quote->'plan'->>'ends_at' is not null and (q.quote->'plan'->>'ends_at')::timestamptz<=public.cv_billing_now())) then raise exception 'Plan no longer available';end if;
 if q.new_redemption then
 select * into o from public.cv_offers where current_version_id=q.offer_version_id for update;
 if not found or not public.cv_offer_eligible(q.offer_version_id,a,(q.quote->>'plan_id')::uuid) then raise exception 'Offer unavailable';end if;
 select count(*) into n from public.cv_payment_offer_reservations r join public.cv_gateway_attempts x on x.id=r.attempt_id where r.offer_id=o.id and r.expires_at>public.cv_billing_now() and x.state in ('preparing','ready','authorized','failed');
 if o.redemption_count+n>=coalesce((select (terms->>'max_redemptions')::integer from public.cv_offer_versions where id=q.offer_version_id),2147483647) then raise exception 'Offer capacity reserved';end if;
 -- Expired reservations cannot grant access on a late capture. Retain attempts/observations as evidence.
 delete from public.cv_payment_offer_reservations where offer_id=o.id and account_id=a and expires_at<=public.cv_billing_now();
 end if;
 insert into public.cv_gateway_attempts(id,intent_id,account_id,quote_id,provider,receipt,amount_minor,currency,requested_by,expires_at)
 values(new_id,i.id,a,q.id,'razorpay',replace(new_id::text,'-',''),i.amount_minor,i.currency,auth.uid(),q.expires_at) returning * into t;
 if q.new_redemption then insert into public.cv_payment_offer_reservations values(t.id,o.id,a,q.expires_at);end if;
 perform public.cv_billing_event(a,auth.uid(),'payment.checkout_reserved',t.id,jsonb_build_object('intent_id',i.id));
 return jsonb_build_object('id',t.id,'state',t.state,'receipt',t.receipt,'amount_minor',t.amount_minor,'currency',t.currency,'currency_exponent',(q.quote->'plan'->>'currency_exponent')::integer,'expires_at',t.expires_at,'create_order',true);
 end $$;

create or replace function public.cv_gateway_order_context(p_order text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'receipt',t.receipt,'amount_minor',t.amount_minor,'currency',t.currency,'currency_exponent',(q.quote->'plan'->>'currency_exponent')::integer) from public.cv_gateway_attempts t join public.cv_billing_quotes q on q.id=t.quote_id where t.order_id=p_order $$;

commit;
