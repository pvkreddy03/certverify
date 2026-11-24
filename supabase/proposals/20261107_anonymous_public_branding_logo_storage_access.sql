-- ValuerSeal staging policy correction (2026-11-07).
-- Reviewed before applying to production. This splits an avatar-bucket
-- RESTRICTIVE policy by role: anonymous public-logo readers must NOT
-- execute the signed-in-only identity helper. Private avatars stay private.
drop policy if exists cv_avatar_private_boundary on storage.objects;
drop policy if exists cv_avatar_anon_private_boundary on storage.objects;
drop policy if exists cv_avatar_authenticated_private_boundary on storage.objects;

create policy cv_avatar_anon_private_boundary on storage.objects
 as restrictive for all to anon
 using (bucket_id <> 'certverify-user-avatars')
 with check (bucket_id <> 'certverify-user-avatars');

create policy cv_avatar_authenticated_private_boundary on storage.objects
 as restrictive for all to authenticated
 using (
  bucket_id <> 'certverify-user-avatars'
  or (auth.uid() is not null
     and public.cv_auth_identity_active()
     and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}[.]webp$'))
  or public.cv_is_platform_admin()
 )
 with check (
  bucket_id <> 'certverify-user-avatars'
  or (auth.uid() is not null
     and public.cv_auth_identity_active()
     and name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}[.]webp$'))
 );
-- Smoke test: SET LOCAL ROLE anon; SELECT name FROM storage.objects
-- WHERE bucket_id='certverify-branding' AND name=an_authorized_logo_path;
-- Also ensure no rows are returned for bucket_id='certverify-user-avatars'.
