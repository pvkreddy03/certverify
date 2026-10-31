-- Native PDF + DOCX letterheads and template/report associations.
begin;
update storage.buckets
  set file_size_limit=12582912,
      allowed_mime_types=array['image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id='certverify-letterheads' and public=false;

alter table public.cv_cover_letter_templates
  drop constraint cv_cover_letter_templates_file_name_check,
  drop constraint cv_cover_letter_templates_file_type_check,
  drop constraint cv_cover_letter_path;
alter table public.cv_cover_letter_templates
  add constraint cv_cover_letter_file_name check (length(file_name) between 1 and 180 and file_name ~* '[.](jpg|jpeg|png|pdf|docx)$'),
  add constraint cv_cover_letter_file_type check (file_type in ('image/jpeg','image/png','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  add constraint cv_cover_letter_path check (
    storage_path ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|pdf|docx)$'
    and split_part(storage_path,'/',1)=account_id::text
    and split_part(storage_path,'/',2)=id::text
  );
alter table public.cv_cover_letter_templates
  add column template_id uuid null references public.certificate_templates(id) on delete set null,
  add column report_format_id uuid null references public.cv_report_format_library(id) on delete set null;

create or replace function public.cv_cover_letter_scope_check()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.template_id is not null and not exists
  (select 1 from public.certificate_templates t where t.id=new.template_id and t.account_id=new.account_id)
 then raise exception 'Letter template must belong to its account' using errcode='42501'; end if;
 if new.report_format_id is not null and not exists
  (select 1 from public.cv_report_format_library f where f.id=new.report_format_id
     and f.account_id=new.account_id and f.template_id=new.template_id)
 then raise exception 'Selected report format must belong to the selected certificate template' using errcode='42501'; end if;
 return new;
end $$;
create trigger cv_cover_letter_guard_scope before insert or update of account_id, template_id, report_format_id
on public.cv_cover_letter_templates for each row execute function public.cv_cover_letter_scope_check();

drop policy cv_letterhead_storage_read on storage.objects;
drop policy cv_letterhead_storage_insert on storage.objects;
drop policy cv_letterhead_storage_delete on storage.objects;
create policy cv_letterhead_storage_read on storage.objects for select to authenticated using (
  bucket_id='certverify-letterheads' and case
    when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|pdf|docx)$'
    then split_part(name,'/',1)=public.cv_selected_account()::text
      and public.cv_account_role(split_part(name,'/',1)::uuid) is not null
    else false end
);
create policy cv_letterhead_storage_insert on storage.objects for insert to authenticated with check (
  bucket_id='certverify-letterheads' and case
    when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|pdf|docx)$'
    then split_part(name,'/',1)=public.cv_selected_account()::text
      and public.cv_account_role(split_part(name,'/',1)::uuid) in ('owner','admin')
    else false end
);
create policy cv_letterhead_storage_delete on storage.objects for delete to authenticated using (
  bucket_id='certverify-letterheads' and case
    when name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|pdf|docx)$'
    then split_part(name,'/',1)=public.cv_selected_account()::text
      and public.cv_account_role(split_part(name,'/',1)::uuid) in ('owner','admin')
      and not exists(select 1 from public.cv_cover_letter_templates c where c.storage_path=storage.objects.name)
    else false end
);
comment on table public.cv_cover_letter_templates is 'Private DOCX/PDF/image reusable letterheads; optional certificate template and report format mappings. Only original documents persist.';
commit;