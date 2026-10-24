-- Follow-up to 20261015_scoped_logo_storage.sql.
-- Root cause confirmed in Storage logs: old RESTRICTIVE policies override
-- the new PERMISSIVE owner uploads and published public reads.
-- Keep the restrictions, but delegate exceptions to the audited RLS helpers.

drop policy if exists cv_branding_storage_no_insert on storage.objects;
create policy cv_branding_storage_no_insert
on storage.objects as restrictive for insert to authenticated
with check (
  bucket_id <> 'certverify-branding'
  or public.cv_storage_logo_upload_allowed(name)
);

drop policy if exists cv_branding_storage_scope on storage.objects;
create policy cv_branding_storage_scope
on storage.objects as restrictive for select to authenticated
using (
  bucket_id <> 'certverify-branding'
  or public.cv_storage_private_logo_read(name)
);

drop policy if exists cv_branding_storage_no_anon on storage.objects;
create policy cv_branding_storage_no_anon
on storage.objects as restrictive for all to anon
using (
  bucket_id <> 'certverify-branding'
  or public.cv_storage_public_logo_read(name)
)
with check (bucket_id <> 'certverify-branding');

-- Explicitly prevent public deletion of issued assets, even if some unrelated
-- future permissive Storage rule were to grant generic anonymous deletion.
drop policy if exists cv_branding_storage_no_anon_delete on storage.objects;
create policy cv_branding_storage_no_anon_delete
on storage.objects as restrictive for delete to anon
using (bucket_id <> 'certverify-branding');
