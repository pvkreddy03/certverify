-- REVIEW PROPOSAL ONLY. Requires explicit staging installation + catalog seed approval.
-- Plain SQL for authorized connected management tools, not a public function/RPC.
-- Only replace the approval input after independently confirming project identity.
-- This synthetic catalog creates no users, admin grants, subscriptions or payments.
begin;
with approved_catalog_inputs(approval_reference,sandbox_project_ref) as (
  values ('CATALOG_SEED_APPROVAL_REQUIRED','nubohxesjeaodqcveiud')
)
select set_config('certverify.catalog_approval',approval_reference,true),
       set_config('certverify.catalog_project',sandbox_project_ref,true)
from approved_catalog_inputs;
do $catalog_seed$
declare
  approval text := btrim(current_setting('certverify.catalog_approval'));
  project text := current_setting('certverify.catalog_project');
  seed_key text := 'certverify-staging-trial-v1';
  plan_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid();
  operator_actor uuid := gen_random_uuid();
  terms jsonb;
  evidence jsonb;
begin
  if project='jhnxztaqfikgvkshifel' then
    raise exception 'Protected source project is forbidden for synthetic catalog seeding';
  end if;
  if project is distinct from 'nubohxesjeaodqcveiud' then
    raise exception 'Only the independently verified approved staging project is allowed';
  end if;
  if approval='CATALOG_SEED_APPROVAL_REQUIRED' or length(approval) not between 8 and 200 then
    raise exception 'Explicit recorded staging catalog seed approval required';
  end if;
  if current_user in ('anon','authenticated','service_role') or auth.uid() is not null
    or coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') in ('anon','authenticated','service_role') then
    raise exception 'Privileged database operator required; customer credentials cannot seed catalog' using errcode='42501';
  end if;
  -- Serialize one-time seed; immutable audit also detects replay after retirement.
  lock table public.cv_plans in exclusive mode;
  if exists(select 1 from public.cv_platform_audit_events e where e.action='platform.sandbox_catalog_seeded' and e.details->>'seed_key'=seed_key)
     or exists(select 1 from public.cv_plan_versions v where v.terms->>'name'='STAGING ONLY — Synthetic Free Trial') then
    raise exception 'Synthetic staging catalog already seeded; edit its version through authorized administration';
  end if;
  terms := jsonb_build_object(
    'name','STAGING ONLY — Synthetic Free Trial',
    'description','Synthetic staging evaluation only. No payment is collected. Seven-day trial, five certificates and three total user seats. Not a commercial offer.',
    'eligibility',jsonb_build_array('individual','organization'),'audience','standard',
    'billing_period','custom','custom_days',7,
    'price_minor',0,'renewal_price_minor',0,'currency','INR','currency_exponent',2,
    'included_seats',3,'extra_seat_price_minor',0,'max_seats',3,
    'certificate_limit',5,'trial_days',7,'visible',true,
    'features',jsonb_build_array('Synthetic staging evaluation','QR verification','No real payments','5 certificates per period','3 total user seats'),
    'starts_at',clock_timestamp(),'ends_at',clock_timestamp()+interval '30 days');
  if not public.cv_validate_plan(terms) then raise exception 'Invalid synthetic staging trial terms';end if;
  -- External operator identity is a new audit-only UUID, not a fabricated owner
  -- identity. The schema permits external actors; this assigns no Auth/admin role.
  insert into public.cv_plans(id,status) values(plan_id,'draft');
  insert into public.cv_plan_versions(id,plan_id,terms,created_by) values(version_id,plan_id,terms,operator_actor);
  update public.cv_plans set status='active',revision=1,current_version_id=version_id where id=plan_id;
  evidence := jsonb_build_object(
    'seed_key',seed_key,'approval_reference',approval,'sandbox_project_ref',project,
    'actor_kind','database_operator','database_operator',session_user,'database_current_role',current_user,
    'external_operator_actor_id',operator_actor,'plan_version_id',version_id,
    'synthetic',true,'no_authentication_claims_impersonated',true,
    'subscriptions_created',0,'payments_created',0,'platform_privileges_granted',0);
  insert into public.cv_billing_audit(actor_id,action,subject_id,details)
    values(operator_actor,'billing.sandbox_catalog_seeded',plan_id,evidence);
  insert into public.cv_platform_audit_events(actor_id,action,subject_id,details)
    values(operator_actor,'platform.sandbox_catalog_seeded',plan_id,evidence);
end $catalog_seed$;
commit;
