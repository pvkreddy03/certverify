-- REVIEW ONLY. Requires explicit owner approval; never part of migration:manifest.
-- Run ONLY in the separately verified sandbox through a privileged SQL connection.
-- psql variables: owner_user_id, approval_reference, sandbox_project_ref.
-- These variables record approval; they cannot establish it or prove database identity.
\set ON_ERROR_STOP on
begin;
select set_config('certverify.bootstrap_owner', :'owner_user_id', true),
       set_config('certverify.bootstrap_approval', :'approval_reference', true),
       set_config('certverify.bootstrap_project', :'sandbox_project_ref', true);
do $bootstrap$
declare
  target uuid := current_setting('certverify.bootstrap_owner')::uuid;
  approval text := btrim(current_setting('certverify.bootstrap_approval'));
  project text := current_setting('certverify.bootstrap_project');
begin
  if length(approval) not between 8 and 200 or project !~ '^[a-z0-9]{20}$' then
    raise exception 'Valid recorded approval and sandbox project reference required';
  end if;
  -- Serializes concurrent first-admin bootstraps and binds grant + evidence atomically.
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
