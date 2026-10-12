-- UNAPPLIED PROPOSAL: Stage 1 -> 2 -> 3 -> 4 -> 5 must precede this transaction.
begin;
alter table public.cv_billing_periods drop constraint cv_billing_periods_access_kind_check;
alter table public.cv_billing_periods add check(access_kind in ('free','trial','complimentary','paid'));
alter table public.cv_billing_periods drop constraint cv_billing_periods_payment_status_check;
alter table public.cv_billing_periods add check(payment_status in ('no_payment_required','waived','captured'));
alter table public.cv_billing_quotes drop constraint cv_billing_quotes_grant_kind_check;
alter table public.cv_billing_quotes add check(grant_kind in ('free','complimentary','paid'));
create table public.cv_gateway_attempts(
 id uuid primary key default gen_random_uuid(),intent_id uuid not null unique references public.cv_payment_intents(id),account_id uuid not null references public.accounts(id),quote_id uuid not null unique references public.cv_billing_quotes(id),
 provider text not null check(provider='razorpay'),receipt text not null unique,amount_minor bigint not null check(amount_minor>0),currency text not null,requested_by uuid not null,
 expires_at timestamptz not null,created_at timestamptz not null default public.cv_billing_now(),order_id text unique,
 state text not null default 'preparing' check(state in ('preparing','ready','authorized','failed','captured','review','refunded','reversed','disputed')),
 captured_payment_id text unique,refunded_minor bigint not null default 0 check(refunded_minor>=0),check(refunded_minor<=amount_minor));
create table public.cv_payment_offer_reservations(attempt_id uuid primary key references public.cv_gateway_attempts(id),offer_id uuid not null references public.cv_offers(id),account_id uuid not null references public.accounts(id),expires_at timestamptz not null,unique(offer_id,account_id));
create table public.cv_gateway_observations(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.cv_gateway_attempts(id),event_reference text not null unique,fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),payment_id text not null,snapshot jsonb not null,occurred_at timestamptz not null default public.cv_billing_now());
create table public.cv_paid_settlements(attempt_id uuid primary key references public.cv_gateway_attempts(id),quote_id uuid not null unique references public.cv_billing_quotes(id),period_id uuid unique references public.cv_billing_periods(id),state text not null check(state in ('scheduled','active','review','refunded','reversed','disputed')),created_at timestamptz not null default public.cv_billing_now());
create table public.cv_refund_commands(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.cv_gateway_attempts(id),amount_minor bigint not null check(amount_minor>0),reason text not null,requested_by uuid not null,provider_refund_id text unique,created_at timestamptz not null default public.cv_billing_now());
-- Commands are single-shot: uncertain network outcomes require reconciliation, never blind reissue.
create function public.cv_gateway_guard() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if tg_op='DELETE' then raise exception 'Payment evidence cannot be deleted';end if;
 if tg_table_name='cv_gateway_attempts' then
 if (to_jsonb(new)-array['order_id','state','captured_payment_id','refunded_minor']) is distinct from (to_jsonb(old)-array['order_id','state','captured_payment_id','refunded_minor'])
 or (old.order_id is not null and new.order_id is distinct from old.order_id) or (old.captured_payment_id is not null and new.captured_payment_id is distinct from old.captured_payment_id)
 or new.refunded_minor<old.refunded_minor then raise exception 'Payment snapshot is immutable';end if;
 elsif tg_table_name='cv_paid_settlements' then
 if new.attempt_id<>old.attempt_id or new.quote_id<>old.quote_id or new.created_at<>old.created_at or (old.period_id is not null and new.period_id is distinct from old.period_id) then raise exception 'Settlement identity is immutable';end if;
 elsif tg_table_name='cv_refund_commands' then
 if (to_jsonb(new)-'provider_refund_id') is distinct from (to_jsonb(old)-'provider_refund_id') or old.provider_refund_id is not null then raise exception 'Refund command is immutable';end if;
 end if;return new;end $$;
create trigger cv_attempt_evidence before update or delete on public.cv_gateway_attempts for each row execute function public.cv_gateway_guard();
create trigger cv_settlement_evidence before update or delete on public.cv_paid_settlements for each row execute function public.cv_gateway_guard();
create trigger cv_refund_evidence before update or delete on public.cv_refund_commands for each row execute function public.cv_gateway_guard();
create trigger cv_observation_evidence before update or delete on public.cv_gateway_observations for each row execute function public.cv_immutable_audit();

create function public.cv_prepare_checkout(p_intent uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_owner();i public.cv_payment_intents;q public.cv_billing_quotes;t public.cv_gateway_attempts;o public.cv_offers;n integer;new_id uuid:=gen_random_uuid();
 begin
 select * into i from public.cv_payment_intents where id=p_intent and account_id=a;if not found then raise exception 'Payment intent unavailable';end if;
 select * into q from public.cv_billing_quotes where id=i.quote_id for update;
 select * into t from public.cv_gateway_attempts where intent_id=i.id;
 if found then return jsonb_build_object('id',t.id,'state',t.state,'order_id',t.order_id,'amount_minor',t.amount_minor,'currency',t.currency,'expires_at',t.expires_at,'create_order',false);end if;
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
 return jsonb_build_object('id',t.id,'state',t.state,'receipt',t.receipt,'amount_minor',t.amount_minor,'currency',t.currency,'expires_at',t.expires_at,'create_order',true);
 end $$;
create function public.cv_bind_gateway_order(p_attempt uuid,p_order text,p_receipt text,p_amount bigint,p_currency text) returns boolean language plpgsql security definer set search_path='' as $$
 declare t public.cv_gateway_attempts;a uuid;
 begin
 select account_id into a from public.cv_gateway_attempts where id=p_attempt;perform 1 from public.accounts where id=a for update;
 select * into t from public.cv_gateway_attempts where id=p_attempt for update;
 if not found or p_order is null or p_receipt is null or p_amount is null or p_currency is null or p_order !~ '^order_[A-Za-z0-9]{1,80}$' or t.receipt<>p_receipt or t.amount_minor<>p_amount or t.currency<>p_currency then raise exception 'Gateway order mismatch';end if;
 if t.order_id is not null then if t.order_id=p_order then return true;else raise exception 'Order already bound';end if;end if;
 update public.cv_gateway_attempts set order_id=p_order,state='ready' where id=t.id;
 perform public.cv_billing_event(a,t.requested_by,'payment.order_bound',t.id,jsonb_build_object('order_id',p_order));return true;end $$;

create function public.cv_payment_attempt(p_attempt uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_account();t public.cv_gateway_attempts;
 begin
 perform 1 from public.accounts where id=a for update;
 if public.cv_billing_account()<>a or not exists(select 1 from public.account_members where account_id=a and user_id=auth.uid() and status='active' and role='owner') then raise exception 'Owner required' using errcode='42501';end if;
 select * into t from public.cv_gateway_attempts where id=p_attempt and account_id=a;if not found then raise exception 'Payment unavailable';end if;
 return jsonb_build_object('id',t.id,'order_id',t.order_id,'state',t.state,'amount_minor',t.amount_minor,'currency',t.currency,'refunded_minor',t.refunded_minor,'expires_at',t.expires_at,
 'period_id',(select period_id from public.cv_paid_settlements where attempt_id=t.id),'settlement',(select state from public.cv_paid_settlements where attempt_id=t.id));end $$;
create function public.cv_gateway_order_context(p_order text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'receipt',receipt,'amount_minor',amount_minor,'currency',currency) from public.cv_gateway_attempts where order_id=p_order $$;

create function public.cv_process_gateway_payment(p_order text,p_payment text,p_amount bigint,p_currency text,p_status text,p_refunded bigint,p_event text,p_fingerprint text,p_disputed boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
 declare t public.cv_gateway_attempts;q public.cv_billing_quotes;a uuid;prior public.cv_gateway_observations;settled public.cv_paid_settlements;o public.cv_offers;period uuid;start_time timestamptz;is_review boolean;
 begin
 select account_id into a from public.cv_gateway_attempts where order_id=p_order;if a is null then raise exception 'Unknown gateway order';end if;
 perform 1 from public.accounts where id=a for update;
 select * into t from public.cv_gateway_attempts where order_id=p_order for update;
 select * into q from public.cv_billing_quotes where id=t.quote_id for update;
 if p_payment is null or p_amount is null or p_currency is null or p_status is null or p_refunded is null or p_event is null or p_fingerprint is null or p_disputed is null or p_payment !~ '^pay_[A-Za-z0-9]{1,80}$' or p_amount<>t.amount_minor or p_currency<>t.currency or p_status not in ('created','authorized','captured','failed','refunded') or p_refunded not between 0 and p_amount or (p_status='refunded' and p_refunded<>p_amount) or ((p_refunded>0 or p_disputed) and p_status not in ('captured','refunded')) or length(p_event) not between 1 and 200 or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Verified payment mismatch';end if;
 select * into prior from public.cv_gateway_observations where event_reference=p_event;
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

create function public.cv_platform_payment_report(p_account uuid default null,p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin();result jsonb;
 begin
 if p_page not between 1 and 10000 then raise exception 'Invalid page';end if;
 select jsonb_build_object('attempts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select t.id,t.account_id,t.intent_id,t.order_id,t.state,t.amount_minor,t.currency,t.refunded_minor,t.created_at,t.expires_at,t.captured_payment_id,s.state settlement,s.period_id from public.cv_gateway_attempts t left join public.cv_paid_settlements s on s.attempt_id=t.id where p_account is null or t.account_id=p_account order by t.created_at desc,t.id limit 25 offset(p_page-1)*25) x),'total',(select count(*) from public.cv_gateway_attempts where p_account is null or account_id=p_account),'page',p_page) into result;
 perform public.cv_billing_event(p_account,actor,'payment.report_viewed',p_account);return result;end $$;
create function public.cv_prepare_refund(p_attempt uuid,p_amount bigint,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin();t public.cv_gateway_attempts;a uuid;cmd public.cv_refund_commands;
 begin
 select account_id into a from public.cv_gateway_attempts where id=p_attempt;perform 1 from public.accounts where id=a for update;perform public.cv_require_platform_admin();
 select * into t from public.cv_gateway_attempts where id=p_attempt for update;
 if t.captured_payment_id is null or p_amount<=0 or p_amount>t.amount_minor-t.refunded_minor or length(btrim(p_reason)) not between 3 and 2000 or p_reason is null then raise exception 'Invalid refund request';end if;
 -- One command until reconciliation proves its outcome. No automatic retries of external POST.
 if exists(select 1 from public.cv_refund_commands where attempt_id=t.id) then raise exception 'Refund already requested; reconcile before another operation';end if;
 insert into public.cv_refund_commands(attempt_id,amount_minor,reason,requested_by) values(t.id,p_amount,p_reason,actor) returning * into cmd;
 perform public.cv_billing_event(a,actor,'payment.refund_requested',cmd.id,jsonb_build_object('attempt_id',t.id,'amount_minor',p_amount,'reason',p_reason));
 return jsonb_build_object('id',cmd.id,'reference',replace(cmd.id::text,'-',''),'payment_id',t.captured_payment_id,'amount_minor',p_amount);end $$;
create function public.cv_bind_refund(p_command uuid,p_refund text) returns boolean language plpgsql security definer set search_path='' as $$
 begin
 if p_refund !~ '^rfnd_[A-Za-z0-9]{1,80}$' then raise exception 'Invalid refund reference';end if;
 update public.cv_refund_commands set provider_refund_id=p_refund where id=p_command and provider_refund_id is null;return found;end $$;

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
 update public.cv_subscriptions set trial_used=trial_used or trial>0,cancel_at_period_end=false,revision=revision+1,
 promotion_version_id=case when r.new_redemption then r.offer_version_id when r.intent in ('start','change','trial') then null else promotion_version_id end,
 promotion_cycles_remaining=case when r.new_redemption then greatest(0,coalesce((r.quote->'offer_terms'->>'cycles')::integer,0)-1) when r.offer_version_id is not null then greatest(0,promotion_cycles_remaining-1) when r.intent in ('start','change','trial') then 0 else promotion_cycles_remaining end where account_id=r.account_id;
 update public.cv_billing_quotes set status='applied' where id=r.id;
 perform public.cv_billing_event(r.account_id,r.accepted_by,'billing.period_started',p,jsonb_build_object('quote_id',r.id,'access_kind',r.grant_kind,'reason',r.grant_reason,'plan_version_id',r.plan_version_id));return p;
 end $$;

create or replace function public.cv_offer_eligible(p_offer uuid,p_account uuid,p_plan uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
 declare o public.cv_offers;t jsonb;existing boolean;
 begin
 select * into o from public.cv_offers where current_version_id=p_offer;
 if not found or o.status<>'active' then return false;end if;select terms into t from public.cv_offer_versions where id=p_offer;
 if (t->>'starts_at' is not null and (t->>'starts_at')::timestamptz>public.cv_billing_now()) or (t->>'ends_at' is not null and (t->>'ends_at')::timestamptz<=public.cv_billing_now())
 or (t->>'max_redemptions' is not null and o.redemption_count+(select count(*) from public.cv_payment_offer_reservations r join public.cv_gateway_attempts x on x.id=r.attempt_id where r.offer_id=o.id and r.expires_at>public.cv_billing_now() and x.state in ('preparing','ready','authorized','failed'))>=(t->>'max_redemptions')::integer)
 or exists(select 1 from public.cv_offer_redemptions where offer_id=o.id and account_id=p_account)
 or (jsonb_array_length(t->'plan_ids')>0 and not (t->'plan_ids' ? p_plan::text)) then return false;end if;
 existing:=exists(select 1 from public.cv_billing_periods where account_id=p_account);
 return case t->>'audience' when 'new' then not existing when 'existing' then existing when 'selected' then t->'account_ids' ? p_account::text else true end;
 end $$;

create or replace function public.cv_active_period(p_account uuid) returns public.cv_billing_periods language sql stable security definer set search_path='' as $$
 select p from public.cv_billing_periods p where p.account_id=p_account and p.starts_at<=public.cv_billing_now() and p.ends_at>public.cv_billing_now()
 and not exists(select 1 from public.cv_paid_settlements s where s.period_id=p.id and s.state in ('refunded','reversed','disputed')) order by p.starts_at desc limit 1 $$;
create or replace function public.cv_subscription_status() returns jsonb language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_account();p public.cv_billing_periods;active boolean;owner boolean;sub public.cv_subscriptions;used bigint:=0;result jsonb;
 begin
 perform 1 from public.accounts where id=a for update;perform public.cv_billing_account();if public.cv_account_enabled(a) then perform public.cv_materialize_scheduled(a);end if;
 p:=public.cv_active_period(a);active:=p.id is not null;
 if not active then select * into p from public.cv_billing_periods where account_id=a order by starts_at desc limit 1;end if;
 select * into sub from public.cv_subscriptions where account_id=a;
 owner:=exists(select 1 from public.account_members where account_id=a and user_id=auth.uid() and status='active' and role='owner');
 if p.id is not null then select certificates_created into used from public.cv_period_usage where period_id=p.id;end if;
 result:=jsonb_build_object('account_id',a,'account_type',(select account_type from public.accounts where id=a),'can_cancel',owner,'can_manage',owner and public.cv_account_enabled(a) and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null),'entitled',active and public.cv_account_enabled(a),
 'status',case when p.id is null then 'unsubscribed' when not active then case when sub.cancel_at_period_end then 'cancelled' else 'expired' end when sub.cancel_at_period_end then 'non_renewing' when p.access_kind='trial' then 'trial' when p.offer_version_id is not null then 'promotional' else 'active' end,
 'period',case when p.id is null then null else jsonb_build_object('id',p.id,'plan_version_id',p.plan_version_id,'plan_id',(select plan_id from public.cv_plan_versions where id=p.plan_version_id),'name',p.plan_snapshot->>'name','billing_period',p.plan_snapshot->>'billing_period','starts_at',p.starts_at,'ends_at',p.ends_at,'licensed_seats',p.licensed_seats,'certificate_limit',p.certificate_limit,'certificates_created',used,'remaining_certificates',case when p.certificate_limit is null then null else greatest(0,p.certificate_limit-used) end,'payment_status',p.payment_status) end,
 'allocated_seats',public.cv_allocated_seats(a),'cancel_at_period_end',coalesce(sub.cancel_at_period_end,false),'trial_used',coalesce(sub.trial_used,false),
 'requests',case when owner then (select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select id,status,intent,seats,public.cv_public_billing_quote(quote) as quote,expires_at,scheduled_for,created_at from public.cv_billing_quotes where account_id=a order by created_at desc limit 50) r) else '[]'::jsonb end,
 'history',case when owner then (select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from (select id,starts_at,ends_at,plan_snapshot,licensed_seats,list_amount_minor,amount_due_minor,currency,access_kind,payment_status from public.cv_billing_periods where account_id=a order by starts_at desc limit 50) h) else '[]'::jsonb end,
 'payments',case when owner then (select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from (select i.id,i.amount_minor,i.currency,coalesce(t.provider,i.provider) provider,i.created_at,t.id attempt_id,t.refunded_minor,coalesce(t.state,(select e.status from public.cv_payment_events e where e.intent_id=i.id order by e.occurred_at desc,e.id limit 1),'pending') status from public.cv_payment_intents i left join public.cv_gateway_attempts t on t.intent_id=i.id where i.account_id=a order by i.created_at desc limit 50) i) else '[]'::jsonb end);
 return result;
 end $$;

create or replace function public.cv_billing_report_status(p_account uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.id is null or p.starts_at>public.cv_billing_now() then 'unknown' when exists(select 1 from public.cv_paid_settlements x where x.period_id=p.id and x.state in ('refunded','reversed','disputed')) then 'expired' when p.ends_at<=public.cv_billing_now() then case when s.cancel_at_period_end then 'cancelled' else 'expired' end when s.cancel_at_period_end then 'non_renewing' when p.access_kind='trial' then 'trial' when p.offer_version_id is not null then 'promotional' else 'active' end
 from (select p_account id) a left join lateral(select * from public.cv_billing_periods where account_id=a.id order by starts_at desc limit 1) p on true left join public.cv_subscriptions s on s.account_id=a.id $$;

do $$ declare t text;f record;
 begin
 foreach t in array array['cv_gateway_attempts','cv_payment_offer_reservations','cv_gateway_observations','cv_paid_settlements','cv_refund_commands'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cv_gateway_guard','cv_prepare_checkout','cv_bind_gateway_order','cv_payment_attempt','cv_gateway_order_context','cv_process_gateway_payment','cv_platform_payment_report','cv_prepare_refund','cv_bind_refund') loop
 execute format('revoke execute on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in ('cv_prepare_checkout','cv_payment_attempt','cv_platform_payment_report','cv_prepare_refund') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 if f.proname in ('cv_bind_gateway_order','cv_gateway_order_context','cv_process_gateway_payment','cv_bind_refund') then execute format('grant execute on function %s to service_role',f.signature);end if;
 end loop;end $$;
commit;
