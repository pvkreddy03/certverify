-- Staging feature: reusable private image-based cover-letter templates.
-- Scoped to the selected account; no public access, no generated PDF retention.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certverify-letterheads', 'certverify-letterheads', false, 6291456,
        array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from storage.buckets where id='certverify-letterheads' and public) then
    raise exception 'Cover letter backgrounds must remain private';
  end if;
end $$;

create table if not exists public.cv_cover_letter_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 100),
  file_name text not null check (length(file_name) between 1 and 180 and file_name ~* '[.](jpg|jpeg|png)$'),
  file_type text not null check (file_type in ('image/jpeg','image/png')),
  storage_path text not null unique,
  qr_x double precision not null default 0.79 check (qr_x between 0 and 1),
  qr_y double precision not null default 0.78 check (qr_y between 0 and 1),
  qr_size double precision not null default 0.16 check (qr_size between 0.085 and 0.5 and qr_x + qr_size <= 1 and qr_y + qr_size <= 1),
  text_x double precision not null default 0.13 check (text_x between 0 and 1),
  text_y double precision not null default 0.28 check (text_y between 0 and 1),
  text_width double precision not null default 0.72 check (text_width between 0.15 and 1 and text_x + text_width <= 1),
  text_height double precision not null default 0.42 check (text_height between 0.12 and 1 and text_y + text_height <= 1),
  body_template text not null default '' check (length(body_template) <= 12000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint cv_cover_letter_path check (
    storage_path ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png)$'
    and split_part(storage_path, '/', 1) = account_id::text
    and split_part(storage_path, '/', 2) = id::text
  )
);

create unique index if not exists cv_cover_letter_name_account
  on public.cv_cover_letter_templates (account_id, lower(btrim(name)));

alter table public.cv_cover_letter_templates enable row level security;
revoke all on public.cv_cover_letter_templates from public, anon;
grant select, insert, update on public.cv_cover_letter_templates to authenticated;

create policy cv_cover_letter_select on public.cv_cover_letter_templates
  for select to authenticated using (
    account_id=public.cv_selected_account()
    and public.cv_account_role(account_id) is not null
  );
create policy cv_cover_letter_insert on public.cv_cover_letter_templates
  for insert to authenticated with check (
    created_by=(select auth.uid())
    and account_id=public.cv_selected_account()
    and public.cv_account_role(account_id) in ('owner','admin')
  );
create policy cv_cover_letter_update on public.cv_cover_letter_templates
  for update to authenticated using (
    account_id=public.cv_selected_account()
    and public.cv_account_role(account_id) in ('owner','admin')
  ) with check (
    account_id=public.cv_selected_account()
    and public.cv_account_role(account_id) in ('owner','admin')
  );

-- Private storage names: account_uuid/template_uuid/revision_uuid.jpg or .png
create policy cv_letterhead_storage_read on storage.objects
  for select to authenticated using (
    bucket_id='certverify-letterheads'
    and case when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png)$'
      then split_part(name,'/',1)=public.cv_selected_account()::text
        and public.cv_account_role(split_part(name,'/',1)::uuid) is not null
      else false end
  );
create policy cv_letterhead_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id='certverify-letterheads'
    and case when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png)$'
      then split_part(name,'/',1)=public.cv_selected_account()::text
        and public.cv_account_role(split_part(name,'/',1)::uuid) in ('owner','admin')
      else false end
  );
create policy cv_letterhead_storage_delete on storage.objects
  for delete to authenticated using (
    bucket_id='certverify-letterheads'
    and case when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png)$'
      then split_part(name,'/',1)=public.cv_selected_account()::text
        and public.cv_account_role(split_part(name,'/',1)::uuid) in ('owner','admin')
        and not exists(select 1 from public.cv_cover_letter_templates c where c.storage_path=storage.objects.name)
      else false end
  );

comment on table public.cv_cover_letter_templates is 'Private letterhead image and QR/text layout per account. Generated cover letters are not stored.';
commit;