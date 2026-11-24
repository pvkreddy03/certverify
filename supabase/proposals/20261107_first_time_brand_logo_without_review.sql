-- ValuerSeal staging-only proposal, applied 2026-11-07.
-- The first verified logo of each account may be published by its owner/admin
-- without platform approval. Version history remains immutable, so replacements
-- (and re-upload after removal) must use the existing independent approval queue.
-- Applying this to production requires separate reviewed migration deployment.

alter table public.cv_branding_versions
  drop constraint cv_branding_versions_origin_check;
alter table public.cv_branding_versions
  add constraint cv_branding_versions_origin_check
  check (origin in ('baseline','approved','initial_logo'));

CREATE OR REPLACE FUNCTION public.cv_can_set_initial_logo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.cv_account_branding b
      join public.cv_branding_versions v on v.id=b.current_version_id
    where b.account_id=public.cv_selected_account()
      and public.cv_account_role(b.account_id) in ('owner','admin')
      and v.logo_asset_id is null
      and not exists (
        select 1 from public.cv_branding_versions history
        where history.account_id=b.account_id
          and history.logo_asset_id is not null
      )
  )
$function$
;

CREATE OR REPLACE FUNCTION public.cv_set_initial_brand_logo(p_logo uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a uuid := public.cv_require_admin();
  old_version public.cv_branding_versions;
  new_version uuid;
  replaced_requests integer := 0;
begin
  -- The account row is the serialization lock for branding changes and
  -- prevents parallel clients from both claiming a free first activation.
  perform 1 from public.accounts where id=a for update;
  select v.* into old_version
  from public.cv_account_branding b
    join public.cv_branding_versions v on v.id=b.current_version_id
  where b.account_id=a
  for update of b;
  if old_version.id is null then
    raise exception 'Branding baseline is missing';
  end if;

  if old_version.logo_asset_id is not null or exists (
    select 1 from public.cv_branding_versions h
    where h.account_id=a and h.logo_asset_id is not null
  ) then
    raise exception 'Initial logo setup has already been used; request branding approval for further changes'
      using errcode='23505';
  end if;

  if p_logo is null or not exists (
    select 1 from public.cv_logo_assets l
    where l.id=p_logo and l.account_id=a and l.state='ready'
  ) then
    raise exception 'Upload and verify a logo belonging to your current organization before saving it'
      using errcode='22023';
  end if;

  -- Old pending proposals refer to the previous baseline. Keep them in
  -- history, but don't leave stale approvals/permissions that can never
  -- be applied after the first logo becomes active.
  update public.cv_branding_permissions perm
    set revoked_at=clock_timestamp(), revoked_by=auth.uid()
    where perm.account_id=a
      and perm.used_at is null and perm.revoked_at is null
      and perm.request_id in (
        select r.id from public.cv_branding_requests r
        where r.account_id=a
          and r.status in ('pending','needs_information','permission_granted')
      );

  update public.cv_branding_requests r
    set status='cancelled', reviewed_at=clock_timestamp(),
        decision_reason='Superseded by first-time logo activation. Resubmit any other branding changes for approval.'
    where r.account_id=a
      and r.status in ('pending','needs_information','permission_granted');
  get diagnostics replaced_requests = row_count;

  insert into public.cv_branding_versions(
    account_id, company_name, professional_details, logo_asset_id,
    created_by, approved_by, origin
  ) values (
    a,old_version.company_name,old_version.professional_details,
    p_logo,auth.uid(),null,'initial_logo'
  ) returning id into new_version;

  update public.cv_account_branding
    set current_version_id=new_version
    where account_id=a;

  insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details)
    values(
      a,auth.uid(),'branding.initial_logo_activated',new_version,
      jsonb_build_object('previous_version_id',old_version.id,'logo_asset_id',p_logo,
        'cancelled_pending_requests',replaced_requests)
    );

  return jsonb_build_object(
    'status','initial_logo_activated',
    'version_id',new_version,
    'cancelled_pending_requests',replaced_requests
  );
end $function$
;

revoke all on function public.cv_can_set_initial_logo() from public,anon;
grant execute on function public.cv_can_set_initial_logo() to authenticated;
revoke all on function public.cv_set_initial_brand_logo(uuid) from public,anon;
grant execute on function public.cv_set_initial_brand_logo(uuid) to authenticated;
