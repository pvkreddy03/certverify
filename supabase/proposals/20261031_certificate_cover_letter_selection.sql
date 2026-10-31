-- Save a reusable cover-letter format choice alongside the Word report choice on each certificate.
-- Only source formats are stored; no generated PDF is retained per certificate.
begin;

alter table public.certificates
 add column if not exists cover_letter_format_id uuid null
 references public.cv_cover_letter_templates(id) on delete set null;

create or replace function public.cv_guard_cover_letter_selection()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.cover_letter_format_id is not null and not exists (
    select 1 from public.cv_cover_letter_templates f
    where f.id = new.cover_letter_format_id
      and f.account_id = new.account_id
      and (f.template_id is null or f.template_id = new.template_id)
      and (f.report_format_id is null or f.report_format_id = new.report_format_id)
  ) then
    raise exception 'Selected cover letter format must match the certificate workspace, template and report format'
      using errcode='42501';
  end if;
  return new;
end $$;

drop trigger if exists cv_guard_cover_letter_selection_trigger on public.certificates;
create trigger cv_guard_cover_letter_selection_trigger
before insert or update of cover_letter_format_id,report_format_id,template_id,account_id
on public.certificates for each row execute function public.cv_guard_cover_letter_selection();

create index if not exists cv_certificates_cover_letter_format_idx
 on public.certificates(cover_letter_format_id) where cover_letter_format_id is not null;

comment on column public.certificates.cover_letter_format_id is
 'Optional selected reusable cover-letter layout. The PDF is generated on demand with the certificate QR and optional Word report; no generated copy is stored.';

commit;