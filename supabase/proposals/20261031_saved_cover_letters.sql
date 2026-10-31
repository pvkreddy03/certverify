-- Saved, named, immutable generated cover letters for My Cover Letters.
-- Source letterhead templates remain separate; generated PDF snapshots are kept private.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('certverify-saved-covers','certverify-saved-covers',false,26214400,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=26214400,allowed_mime_types=array['application/pdf'];

create table if not exists public.cv_saved_cover_letters (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  certificate_id uuid not null references public.certificates(id),
  letterhead_id uuid not null references public.cv_cover_letter_templates(id),
  name text not null check(length(btrim(name)) between 2 and 120),
  output_mode text not null check(output_mode in ('qr','manual','auto')),
  includes_report boolean not null default false,
  report_format_id uuid references public.cv_report_format_library(id) on delete set null,
  pdf_storage_path text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default clock_timestamp(),
  constraint cv_saved_cover_path check (
    pdf_storage_path ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
    and split_part(pdf_storage_path,'/',1) = account_id::text
    and split_part(pdf_storage_path,'/',2) = created_by::text
    and split_part(split_part(pdf_storage_path,'/',3),'.',1) = id::text
  )
);
create index if not exists cv_saved_cover_account_created on public.cv_saved_cover_letters(account_id,created_at desc);

create function public.cv_saved_cover_scope_check()
returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if not exists (
    select 1 from public.certificates c where c.id=new.certificate_id and c.account_id=new.account_id
  ) then raise exception 'Certificate is outside this workspace' using errcode='42501'; end if;
  if not exists (
    select 1 from public.cv_cover_letter_templates l where l.id=new.letterhead_id and l.account_id=new.account_id
  ) then raise exception 'Letterhead is outside this workspace' using errcode='42501'; end if;
  if new.report_format_id is not null and not exists(
    select 1 from public.cv_report_format_library r
      join public.certificates c on c.id=new.certificate_id
      where r.id=new.report_format_id and r.account_id=new.account_id and r.template_id=c.template_id
  ) then raise exception 'Report format does not match the certificate' using errcode='42501'; end if;
  if new.includes_report <> (new.report_format_id is not null) then
    raise exception 'Report choice is inconsistent' using errcode='23514'; end if;
  return new;
end $$;
create trigger cv_saved_cover_verify_scope before insert or update of account_id,certificate_id,letterhead_id,report_format_id,includes_report
on public.cv_saved_cover_letters for each row execute function public.cv_saved_cover_scope_check();

alter table public.cv_saved_cover_letters enable row level security;
revoke all on public.cv_saved_cover_letters from public,anon,authenticated;
grant select,insert on public.cv_saved_cover_letters to authenticated;
grant update(name) on public.cv_saved_cover_letters to authenticated;
create policy cv_saved_cover_select on public.cv_saved_cover_letters
for select to authenticated using (
  account_id=public.cv_selected_account() and public.cv_account_role(account_id) is not null
);
create policy cv_saved_cover_insert on public.cv_saved_cover_letters
for insert to authenticated with check (
  account_id=public.cv_selected_account() and created_by=(select auth.uid())
  and public.cv_account_role(account_id) is not null
);
create policy cv_saved_cover_rename on public.cv_saved_cover_letters
for update to authenticated using (
  account_id=public.cv_selected_account() and
  (created_by=(select auth.uid()) or public.cv_account_role(account_id) in ('owner','admin'))
) with check (
  account_id=public.cv_selected_account() and
  (created_by=(select auth.uid()) or public.cv_account_role(account_id) in ('owner','admin'))
);

create policy cv_saved_cover_file_read on storage.objects for select to authenticated using (
  bucket_id='certverify-saved-covers' and case
    when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
    then split_part(name,'/',1)=public.cv_selected_account()::text
      and public.cv_account_role(split_part(name,'/',1)::uuid) is not null
    else false end
);
create policy cv_saved_cover_file_insert on storage.objects for insert to authenticated with check (
  bucket_id='certverify-saved-covers' and case
    when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
    then split_part(name,'/',1)=public.cv_selected_account()::text
      and split_part(name,'/',2)=(select auth.uid())::text
      and public.cv_account_role(split_part(name,'/',1)::uuid) is not null
    else false end
);
create policy cv_saved_cover_file_rollback on storage.objects for delete to authenticated using (
  bucket_id='certverify-saved-covers' and case
    when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.]pdf$'
    then split_part(name,'/',1)=public.cv_selected_account()::text
      and split_part(name,'/',2)=(select auth.uid())::text
      and not exists(select 1 from public.cv_saved_cover_letters l where l.pdf_storage_path=storage.objects.name)
    else false end
);
comment on table public.cv_saved_cover_letters is 'User-named, private, immutable generated PDF cover letter snapshots, retained for convenient re-download; separate from reusable letterhead templates.';
commit;