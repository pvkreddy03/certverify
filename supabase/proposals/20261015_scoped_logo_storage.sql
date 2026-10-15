-- Staging proposal: scoped issuer logo upload and public snapshot read without a
-- service-role key. The existing branding bucket stays PRIVATE and immutable.
-- Only the audited reservation's creator may upload the expected path.
drop policy if exists cv_branding_storage_scoped_upload on storage.objects;
create policy cv_branding_storage_scoped_upload on storage.objects
for insert to authenticated
with check (
  bucket_id = 'certverify-branding'
  and exists (
    select 1 from public.cv_logo_assets l
    where l.storage_path = name
      and l.state = 'reserved'
      and l.created_by = auth.uid()
      and public.cv_auth_identity_active()
      and public.cv_account_role(l.account_id) in ('owner','admin')
  )
);

-- Allow the private owner and the MFA platform reviewer to preview a
-- normalized stored logo. Other members see only approved branding versions.
-- Storage does not need to forward custom account-selector headers.
create or replace function public.cv_storage_private_logo_read(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $
  select exists (
    select 1 from public.cv_logo_assets l
    where l.storage_path=p_path and l.state='ready'
      and (
        public.cv_is_platform_admin()
        or (
          public.cv_auth_identity_active()
          and (
            public.cv_account_role(l.account_id) in ('owner','admin')
            or (
              public.cv_account_role(l.account_id)='member'
              and exists (
                select 1 from public.cv_branding_versions v
                where v.logo_asset_id=l.id
              )
            )
          )
        )
      )
  );
$;
revoke all on function public.cv_storage_private_logo_read(text) from public, anon;
grant execute on function public.cv_storage_private_logo_read(text) to authenticated;
drop policy if exists cv_branding_storage_authenticated_ready_read on storage.objects;
create policy cv_branding_storage_authenticated_ready_read on storage.objects
for select to authenticated
using (
  bucket_id='certverify-branding'
  and public.cv_storage_private_logo_read(name)
);

-- Only logo objects from a completed immutable issuance snapshot become
-- publicly readable. Draft and unapproved uploads are never exposed.
create or replace function public.cv_storage_public_logo_read(p_path text)
returns boolean language sql stable security definer set search_path = ''
as $$
select exists (
  select 1
  from public.cv_logo_assets l
  join public.cv_branding_versions v on v.logo_asset_id=l.id
  join public.cv_certificate_branding cb on cb.branding_version_id=v.id
  join public.certificates c on c.id=cb.certificate_id
  where l.storage_path=p_path and l.state='ready'
    and c.public_verification_id is not null
);
$$;
revoke all on function public.cv_storage_public_logo_read(text) from public, authenticated;
grant execute on function public.cv_storage_public_logo_read(text) to anon;
drop policy if exists cv_branding_storage_public_issued_logo on storage.objects;
create policy cv_branding_storage_public_issued_logo on storage.objects
for select to anon
using (
  bucket_id='certverify-branding'
  and public.cv_storage_public_logo_read(name)
);

-- Finalization rechecks trusted storage metadata inside Postgres. It never
-- permits rewriting an object, substituting another tenant's reservation or
-- publishing a logo. Platform approval remains a separate MFA-gated action.
create or replace function public.cv_finalize_logo(p_asset uuid,p_hash text,p_bytes integer)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  l public.cv_logo_assets;
  caller_role text := coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
begin
  if caller_role not in ('authenticated','service_role') then
    raise exception 'Trusted upload service required' using errcode='42501';
  end if;
  select * into l from public.cv_logo_assets where id=p_asset;
  if not found then raise exception 'Invalid upload reservation'; end if;
  perform 1 from public.accounts where id=l.account_id for update;
  select * into l from public.cv_logo_assets where id=p_asset for update;
  if not found or l.state<>'reserved' then raise exception 'Invalid upload reservation'; end if;

  if caller_role='authenticated' and (
    not public.cv_auth_identity_active()
    or auth.uid() is distinct from l.created_by
    or public.cv_selected_account() is distinct from l.account_id
    or coalesce(public.cv_account_role(l.account_id),'') not in ('owner','admin')
  ) then
    raise exception 'Logo finalization is restricted to its authorized uploader' using errcode='42501';
  end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$'
     or p_bytes is null or p_bytes not between 1 and 2097152 then
    raise exception 'Invalid logo metadata';
  end if;
  if not exists (
    select 1 from public.account_members
    where account_id=l.account_id and user_id=l.created_by
      and status='active' and role in ('owner','admin')
  ) then raise exception 'Uploader access removed'; end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id='certverify-branding'
      and name=l.storage_path
      and metadata->>'mimetype'='image/webp'
      and metadata->>'size'=p_bytes::text
  ) then raise exception 'Sanitized Storage object missing'; end if;
  update public.cv_logo_assets
    set state='ready',content_hash=p_hash,byte_size=p_bytes,mime_type='image/webp'
  where id=p_asset;
  insert into public.cv_audit_events(account_id,actor_id,action,subject_id)
  values(l.account_id,l.created_by,'branding.logo_uploaded',l.id);
  return true;
end;
$$;
revoke all on function public.cv_finalize_logo(uuid,text,integer) from public, anon;
grant execute on function public.cv_finalize_logo(uuid,text,integer) to authenticated, service_role;
