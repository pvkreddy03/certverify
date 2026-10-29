-- Multiple DOCX report formats per certificate template.
-- Original Word files live in a PRIVATE Storage bucket, never in PostgreSQL.
-- The earlier cv_report_formats table is left untouched for safe staging migration.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certverify-word-formats', 'certverify-word-formats', false, 4194304,
        array['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

do $$
begin
  if exists (select 1 from storage.buckets where id = 'certverify-word-formats' and public) then
    raise exception 'Report Word storage bucket must remain private';
  end if;
end $$;

create table if not exists public.cv_report_format_library (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.certificate_templates(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  format_name text not null check(length(btrim(format_name)) between 2 and 120),
  file_name text not null check(length(file_name) between 1 and 180 and file_name ~* '[.]docx$'),
  storage_path text not null unique,
  bindings jsonb not null default '[]'::jsonb check(jsonb_typeof(bindings) = 'array'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint cv_report_format_path check(storage_path = account_id::text || '/' || template_id::text || '/' || id::text || '/' || split_part(storage_path, '/', 4)
    and split_part(storage_path, '/', 4) ~* '^[0-9a-f-]{36}[.]docx$')
);
create unique index if not exists cv_report_format_name_per_template
on public.cv_report_format_library(template_id, lower(btrim(format_name)));

alter table public.cv_report_format_library enable row level security;
revoke all on public.cv_report_format_library from public, anon;
grant select, insert, update on public.cv_report_format_library to authenticated;

create policy cv_report_library_read on public.cv_report_format_library
  for select to authenticated using (
    account_id = public.cv_selected_account()
    and public.cv_can_use_template(template_id, false)
    and exists (select 1 from public.certificate_templates t where t.id=template_id and t.account_id=cv_report_format_library.account_id)
  );
create policy cv_report_library_insert on public.cv_report_format_library
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and account_id = public.cv_selected_account()
    and public.cv_can_use_template(template_id, true)
    and exists (select 1 from public.certificate_templates t where t.id=template_id and t.account_id=cv_report_format_library.account_id)
  );
create policy cv_report_library_update on public.cv_report_format_library
  for update to authenticated using (
    account_id = public.cv_selected_account()
    and public.cv_can_use_template(template_id, true)
  ) with check (
    account_id = public.cv_selected_account()
    and public.cv_can_use_template(template_id, true)
    and exists (select 1 from public.certificate_templates t where t.id=template_id and t.account_id=cv_report_format_library.account_id)
  );

-- Upload/download requires a selected workspace and permission for the
-- template encoded in the private object path:
-- account_uuid/template_uuid/format_uuid/revision_uuid.docx
create policy cv_word_formats_storage_read on storage.objects
  for select to authenticated using (
    bucket_id = 'certverify-word-formats'
    and case when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]docx$'
      then split_part(name,'/',1) = public.cv_selected_account()::text
        and public.cv_can_use_template(split_part(name,'/',2)::uuid, false)
      else false end
  );
create policy cv_word_formats_storage_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'certverify-word-formats'
    and case when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]docx$'
      then split_part(name,'/',1) = public.cv_selected_account()::text
        and public.cv_can_use_template(split_part(name,'/',2)::uuid, true)
      else false end
  );
create policy cv_word_formats_storage_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'certverify-word-formats'
    and case when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]docx$'
      then split_part(name,'/',1) = public.cv_selected_account()::text
        and public.cv_can_use_template(split_part(name,'/',2)::uuid, true)
        and not exists (select 1 from public.cv_report_format_library l where l.storage_path=storage.objects.name)
      else false end
  );

-- Remember a preferred Word format on certificate creation; keeping null
-- means ordinary QR-only issuance works unchanged.
alter table public.certificates
  add column if not exists report_format_id uuid
  references public.cv_report_format_library(id) on delete set null;

create function public.cv_guard_report_format_selection()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.report_format_id is not null and not exists (
    select 1 from public.cv_report_format_library f
    where f.id = new.report_format_id
      and f.template_id = new.template_id
      and f.account_id = new.account_id
  ) then
    raise exception 'Selected report format must belong to the certificate template and account' using errcode='42501';
  end if;
  return new;
end; $$;
create trigger cv_guard_report_format_selection_trigger
  before insert or update of report_format_id, template_id, account_id on public.certificates
  for each row execute function public.cv_guard_report_format_selection();

comment on table public.cv_report_format_library is 'One row per named report format; original DOCX stored in private Supabase Storage, generated reports never persisted';
commit;
