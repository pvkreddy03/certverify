-- Staging-only refinement: display the current approved organization logo on
-- all issued certificates, while preserving immutable issuer/text snapshots.
-- Each successful upload is stored once in the private Storage bucket.
-- No certificate record, counters, certificate IDs or historical snapshots change.
-- Public Storage reads are restricted to approved logos for accounts with
-- already issued, publicly verifiable certificates.
create or replace function public.cv_public_certificate(p_reference text)
returns jsonb language plpgsql stable security definer set search_path=''
as $body$
declare
  result jsonb;
  issued public.cv_branding_versions;
  current_approved public.cv_branding_versions;
begin
  result := public.cv_public_certificate_stage2(p_reference);
  if result is null then return null; end if;
  select v.* into issued
  from public.certificates c
  join public.cv_certificate_branding cb on cb.certificate_id=c.id
  join public.cv_branding_versions v on v.id=cb.branding_version_id
  where c.public_verification_id=(result->>'public_verification_id')::uuid;

  select v.* into current_approved
  from public.certificates c
  join public.cv_account_branding ab on ab.account_id=c.account_id
  join public.cv_branding_versions v on v.id=ab.current_version_id
    and v.account_id=c.account_id
  where c.public_verification_id=(result->>'public_verification_id')::uuid;

  -- Name/details retain approved-at-issuance identity; logo is shared,
  -- automatically reflecting the latest approved company logo.
  return result || jsonb_build_object(
    'issuer_name',issued.company_name,
    'issuer_details',issued.professional_details,
    'logo_available',case when current_approved.id is not null
      then exists (select 1 from public.cv_logo_assets l
        where l.id=current_approved.logo_asset_id
          and l.account_id=current_approved.account_id and l.state='ready')
      else exists (select 1 from public.cv_logo_assets l
        where l.id=issued.logo_asset_id and l.account_id=issued.account_id and l.state='ready')
      end,
    'branding_reconciled',issued.id is not null
  );
end
$body$;

create or replace function public.cv_public_logo_path(p_reference text)
returns text language plpgsql stable security definer set search_path=''
as $body$
declare
  result jsonb;
  path text;
begin
  result := public.cv_public_certificate(p_reference);
  if result is null then return null; end if;
  -- Approved current logo takes priority, including for older certificates.
  select l.storage_path into path
  from public.certificates c
  join public.cv_account_branding ab on ab.account_id=c.account_id
  join public.cv_branding_versions v on v.id=ab.current_version_id
    and v.account_id=c.account_id
  join public.cv_logo_assets l on l.id=v.logo_asset_id
    and l.account_id=c.account_id and l.state='ready'
  where c.public_verification_id=(result->>'public_verification_id')::uuid;
  if found then return path; end if;
  -- If branding is currently approved with no logo, respect its removal.
  if exists (
    select 1 from public.certificates c
    join public.cv_account_branding ab on ab.account_id=c.account_id
    join public.cv_branding_versions v on v.id=ab.current_version_id
      and v.account_id=c.account_id
    where c.public_verification_id=(result->>'public_verification_id')::uuid
  ) then return null; end if;

  select l.storage_path into path
  from public.certificates c
  join public.cv_certificate_branding cb on cb.certificate_id=c.id
  join public.cv_branding_versions v on v.id=cb.branding_version_id
  join public.cv_logo_assets l on l.id=v.logo_asset_id
    and l.account_id=c.account_id and l.state='ready'
  where c.public_verification_id=(result->>'public_verification_id')::uuid;
  return path;
end
$body$;

-- Storage policy helper: publicly allow only a READY logo that is either
-- in an issuance snapshot or currently approved for an account that already
-- has a publicly verifiable certificate. Never expose pending/reserved files.
create or replace function public.cv_storage_public_logo_read(p_path text)
returns boolean language sql stable security definer set search_path=''
as $body$
  select exists (
    select 1 from public.cv_logo_assets l
    where l.storage_path=p_path and l.state='ready'
      and (
        exists (
          select 1 from public.cv_branding_versions v
          join public.cv_certificate_branding cb on cb.branding_version_id=v.id
          join public.certificates c on c.id=cb.certificate_id
          where v.logo_asset_id=l.id and v.account_id=l.account_id
            and c.account_id=l.account_id and c.public_verification_id is not null
        )
        or exists (
          select 1 from public.cv_account_branding ab
          join public.cv_branding_versions v on v.id=ab.current_version_id
            and v.account_id=ab.account_id
          join public.certificates c on c.account_id=ab.account_id
          where ab.account_id=l.account_id and v.logo_asset_id=l.id
            and c.public_verification_id is not null
        )
      )
  );
$body$;
revoke all on function public.cv_storage_public_logo_read(text) from public,authenticated;
grant execute on function public.cv_storage_public_logo_read(text) to anon;
