-- REVIEW ONLY: separate explicit owner privilege approval is required.
-- Plain SQL for connected Supabase execute_sql tools; NOT an installer or RPC.
-- The authorized operator substitutes the two non-secret placeholders below
-- after independently verifying the connected project is nubohxesjeaodqcveiud.
-- No SQL text or application setting can prove the remote project identity.
begin;
with approved_operator_inputs(owner_user_id,approval_reference,sandbox_project_ref) as (
  values ('OWNER_UUID_APPROVAL_REQUIRED','APPROVAL_REFERENCE_REQUIRED','nubohxesjeaodqcveiud')
)
select set_config('certverify.bootstrap_owner',owner_user_id,true),
       set_config('certverify.bootstrap_approval',approval_reference,true),
       set_config('certverify.bootstrap_project',sandbox_project_ref,true)
from approved_operator_inputs;
do $bootstrap$
declare
  raw_target text := current_setting('certverify.bootstrap_owner');
  target uuid;
  approval text := btrim(current_setting('certverify.bootstrap_approval'));
  project text := current_setting('certverify.bootstrap_project');
begin
  if project='jhnxztaqfikgvkshifel' then
    raise exception 'Protected source project is not a sandbox bootstrap target';
  end if;
  if project is distinct from 'nubohxesjeaodqcveiud' then
    raise exception 'Only the independently verified approved staging project is allowed';
  end if;
  if raw_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or approval='APPROVAL_REFERENCE_REQUIRED' or length(approval) not between 8 and 200 then
    raise exception 'Verified owner UUID and explicit recorded privilege approval required';
  end if;
  target := raw_target::uuid;
  -- Grant and immutable evidence share one transaction; concurrent grants serialize.
  lock table public.cv_platform_admins in exclusive mode;
  if exists(select 1 from public.cv_platform_admins) then
    raise exception 'First-admin bootstrap only: use reviewed administration for subsequent grants';
  end if;
  if not exists(select 1 from auth.users u where u.id=target and u.email_confirmed_at is not null
      and coalesce((to_jsonb(u)->>'banned_until')::timestamptz,'-infinity'::timestamptz)<=clock_timestamp()
      and to_jsonb(u)->>'deleted_at' is null
      and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)) then
    raise exception 'Owner must have an active confirmed non-anonymous authentication account';
  end if;
  if not exists(select 1 from auth.mfa_factors where user_id=target and factor_type='totp' and status='verified') then
    raise exception 'Owner must first verify a real TOTP factor';
  end if;
  insert into public.cv_platform_admins(user_id,granted_by) values(target,null);
  insert into public.cv_platform_audit_events(actor_id,action,subject_id,details)
    values(target,'platform.sandbox_owner_bootstrapped',target,jsonb_build_object(
      'approval_reference',approval,'sandbox_project_ref',project,
      'database_operator',session_user,'actor_is_grant_recipient',true,
      'granted_by_external_operator',true));
end $bootstrap$;
commit;
