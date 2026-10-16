-- STAGING ONLY: complimentary quota top-up for in-progress internal testing.
-- Production deployment must NEVER apply this operational migration.
-- This does not reset counters, change prior billing periods, fabricate payment,
-- change account roles, or modify historical certificates.
CREATE TABLE IF NOT EXISTS public.cv_staging_certificate_allowances (
  period_id uuid PRIMARY KEY REFERENCES public.cv_billing_periods(id) ON DELETE RESTRICT,
  extra_certificates bigint NOT NULL CHECK (extra_certificates BETWEEN 1 AND 100),
  expires_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
  granted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON public.cv_staging_certificate_allowances FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE public.cv_staging_certificate_allowances ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.cv_staging_effective_certificate_limit(p_period uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $quota$
  SELECT CASE WHEN p.certificate_limit IS NULL THEN NULL
    ELSE p.certificate_limit + coalesce((
      SELECT s.extra_certificates
      FROM public.cv_staging_certificate_allowances s
      WHERE s.period_id=p.id
        AND s.expires_at>public.cv_billing_now()
        AND p.access_kind IN ('free','trial','complimentary')
        AND p.payment_status IN ('no_payment_required','waived')
    ),0)
  END
  FROM public.cv_billing_periods p WHERE p.id=p_period
$quota$;
REVOKE ALL ON FUNCTION public.cv_staging_effective_certificate_limit(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cv_consume_certificate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 declare p public.cv_billing_periods;
 begin p:=public.cv_require_entitlement(new.account_id);
 update public.cv_period_usage set certificates_created=certificates_created+1 where period_id=p.id and (p.certificate_limit is null or certificates_created<public.cv_staging_effective_certificate_limit(p.id));
 if not found then raise exception 'Certificate generation quota exhausted';end if;
 insert into public.cv_certificate_consumptions(certificate_id,account_id,period_id) values(new.id,new.account_id,p.id);return new;
 end $function$
;

CREATE OR REPLACE FUNCTION public.cv_subscription_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 'period',case when p.id is null then null else jsonb_build_object('id',p.id,'plan_version_id',p.plan_version_id,'plan_id',(select plan_id from public.cv_plan_versions where id=p.plan_version_id),'name',p.plan_snapshot->>'name','billing_period',p.plan_snapshot->>'billing_period','starts_at',p.starts_at,'ends_at',p.ends_at,'licensed_seats',p.licensed_seats,'certificate_limit',public.cv_staging_effective_certificate_limit(p.id),'certificates_created',used,'remaining_certificates',case when p.certificate_limit is null then null else greatest(0,public.cv_staging_effective_certificate_limit(p.id)-used) end,'payment_status',p.payment_status) end,
 'allocated_seats',public.cv_allocated_seats(a),'cancel_at_period_end',coalesce(sub.cancel_at_period_end,false),'trial_used',coalesce(sub.trial_used,false),
 'requests',case when owner then (select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select id,status,intent,seats,public.cv_public_billing_quote(quote) as quote,expires_at,scheduled_for,created_at from public.cv_billing_quotes where account_id=a order by created_at desc limit 50) r) else '[]'::jsonb end,
 'history',case when owner then (select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from (select id,starts_at,ends_at,plan_snapshot,licensed_seats,list_amount_minor,amount_due_minor,currency,access_kind,payment_status from public.cv_billing_periods where account_id=a order by starts_at desc limit 50) h) else '[]'::jsonb end,
 'payments',case when owner then (select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from (select i.id,i.amount_minor,i.currency,coalesce(t.provider,i.provider) provider,i.created_at,t.id attempt_id,t.refunded_minor,coalesce(t.state,(select e.status from public.cv_payment_events e where e.intent_id=i.id order by e.occurred_at desc,e.id limit 1),'pending') status from public.cv_payment_intents i left join public.cv_gateway_attempts t on t.intent_id=i.id where i.account_id=a order by i.created_at desc limit 50) i) else '[]'::jsonb end);
 return result;
 end $function$
;

DO $grant$
DECLARE target_account uuid;
DECLARE active_period public.cv_billing_periods;
BEGIN
  SELECT id INTO STRICT target_account FROM public.accounts WHERE lower(account_name)='pooja stores';
  SELECT p.* INTO STRICT active_period FROM public.cv_billing_periods p
    WHERE p.account_id=target_account AND p.starts_at<=clock_timestamp() AND p.ends_at>clock_timestamp();
  IF active_period.certificate_limit<>5
    OR active_period.access_kind<>'free'
    OR active_period.payment_status<>'no_payment_required'
    OR active_period.ends_at>clock_timestamp()+interval '14 days'
    OR (SELECT certificates_created FROM public.cv_period_usage WHERE period_id=active_period.id)<>5
  THEN RAISE EXCEPTION 'Unexpected staging trial state; no allowance applied'; END IF;
  INSERT INTO public.cv_staging_certificate_allowances(period_id,extra_certificates,expires_at,reason)
  VALUES (active_period.id,25,active_period.ends_at,
  'Operator-approved, staging-only extra test issuance for QR, branding and invitation QA on 15 October 2026');
END $grant$;
