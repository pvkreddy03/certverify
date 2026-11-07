-- Staging-authorized schema for the ValuerSeal internal platform owner workspace.
-- DO NOT automatically provision a license in production. A separate,
-- explicitly approved operator action binds an internal workspace to a
-- currently verified platform administrator and their own account.
-- Existing customer subscriptions, invoice history and approval policies stay intact.

create table if not exists public.cv_internal_workspace_licenses (
  account_id uuid primary key references public.accounts(id),
  owner_user_id uuid not null references auth.users(id),
  granted_at timestamptz not null default clock_timestamp(),
  reason text not null
);
alter table public.cv_internal_workspace_licenses enable row level security;
revoke all on public.cv_internal_workspace_licenses from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cv_internal_workspace_enabled(p_account uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1 from public.cv_internal_workspace_licenses w
      join public.account_members m on m.account_id=w.account_id
       and m.user_id=w.owner_user_id and m.status='active' and m.role='owner'
      join public.cv_platform_admins pa on pa.user_id=w.owner_user_id and pa.active
    where w.account_id=p_account and public.cv_account_enabled(p_account)
  )
$function$
;

CREATE OR REPLACE FUNCTION public.cv_my_internal_workspace()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(public.cv_internal_workspace_enabled(public.cv_selected_account()),false)
$function$
;

CREATE OR REPLACE FUNCTION public.cv_billing_period_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform 1 from public.accounts where id=new.account_id for update;
  if exists(
    select 1 from public.cv_billing_periods p
    where p.account_id=new.account_id and p.starts_at<new.ends_at and p.ends_at>new.starts_at
  ) then
    if not (
      new.access_kind='complimentary'
      and new.payment_status='waived'
      and new.certificate_limit is null
      and new.licensed_seats=10000
      and new.amount_due_minor=0 and new.list_amount_minor=0
      and new.plan_snapshot->>'internal_workspace'='true'
      and public.cv_internal_workspace_enabled(new.account_id)
      and exists(
        select 1 from public.cv_internal_workspace_licenses l
        where l.account_id=new.account_id and l.owner_user_id=new.created_by
      )
      and not exists(
        select 1 from public.cv_billing_periods p
        where p.account_id=new.account_id and p.plan_snapshot->>'internal_workspace'='true'
      )
    ) then raise exception 'Overlapping billing periods forbidden'; end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cv_active_period(p_account uuid)
 RETURNS cv_billing_periods
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p from public.cv_billing_periods p
  where p.account_id=p_account
    and p.starts_at<=public.cv_billing_now() and p.ends_at>public.cv_billing_now()
    and (p.plan_snapshot->>'internal_workspace' is distinct from 'true'
      or public.cv_internal_workspace_enabled(p_account))
    and not exists(
      select 1 from public.cv_paid_settlements s
      where s.period_id=p.id and s.state in ('refunded','reversed','disputed')
    )
  order by p.starts_at desc limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.cv_platform_owner_branding_save(p_name text, p_details text, p_logo uuid, p_explanation text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a uuid; r uuid; old_r record; existing public.cv_branding_versions;
  name_clean text := btrim(coalesce(p_name,''));
  details_clean text := coalesce(p_details,'');
begin
  if not public.cv_is_platform_admin() then
    raise exception 'Platform administrator MFA is required' using errcode='42501';
  end if;
  a:=public.cv_require_admin();
  if not exists(
    select 1 from public.account_members
    where account_id=a and user_id=auth.uid() and role='owner' and status='active'
  ) then raise exception 'Only the platform administrator acting as workspace owner can use direct branding' using errcode='42501';
  end if;
  if length(name_clean)<2 or length(name_clean)>160 or length(details_clean)>2000
    or length(coalesce(p_explanation,''))>2000 then
    raise exception 'Invalid branding name or details';
  end if;
  if p_logo is not null and not exists(
    select 1 from public.cv_logo_assets
    where id=p_logo and account_id=a and state='ready'
  ) then raise exception 'Logo is not verified for this workspace'; end if;
  select v.* into existing from public.cv_account_branding b
    join public.cv_branding_versions v on v.id=b.current_version_id
    where b.account_id=a for update of b;
  if existing.id is null then raise exception 'Branding baseline missing'; end if;
  for old_r in
    select id from public.cv_branding_requests
    where account_id=a and status in ('pending','needs_information','permission_granted')
    for update
  loop
    update public.cv_branding_requests
      set status='cancelled', reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),
          decision_reason='Superseded by verified platform owner direct branding'
      where id=old_r.id;
    insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details)
      values(a,auth.uid(),'branding.platform_owner_superseded',old_r.id,'{}'::jsonb);
  end loop;
  if existing.company_name=name_clean
    and existing.professional_details=details_clean
    and existing.logo_asset_id is not distinct from p_logo then
    return jsonb_build_object('status','unchanged','version_id',existing.id);
  end if;
  r:=public.cv_request_branding(name_clean,details_clean,p_logo,coalesce(p_explanation,''));
  perform public.cv_apply_branding_version(r,auth.uid(),auth.uid());
  update public.cv_branding_requests
    set reviewed_by=auth.uid(), reviewed_at=clock_timestamp(),
        decision_reason='Directly applied by MFA-verified platform owner'
    where id=r;
  insert into public.cv_platform_audit_events(actor_id,action,account_id,subject_id,details)
    values(auth.uid(),'branding.platform_owner_direct',a,r,
           jsonb_build_object('self_service',true,'mfa_required',true));
  return jsonb_build_object('status','applied','request_id',r);
end $function$
;

revoke all on function public.cv_internal_workspace_enabled(uuid) from public,anon,authenticated;
revoke all on function public.cv_my_internal_workspace() from public,anon;
grant execute on function public.cv_my_internal_workspace() to authenticated;
revoke all on function public.cv_platform_owner_branding_save(text,text,uuid,text) from public,anon;
grant execute on function public.cv_platform_owner_branding_save(text,text,uuid,text) to authenticated;
