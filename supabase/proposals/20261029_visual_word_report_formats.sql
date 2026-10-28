-- STAGING FIRST: private, template-bound Word report formats.
-- Uploads are base64 DOCX up to 4 MiB. This initial implementation avoids
-- public Storage buckets; move larger files to a private storage adapter later.
begin;

create table if not exists public.cv_report_formats (
  template_id uuid primary key references public.certificate_templates(id) on delete cascade,
  account_id uuid not null references public.accounts(id),
  created_by uuid not null references auth.users(id),
  file_name text not null check(length(file_name) between 1 and 180 and file_name ~* '[.]docx$'),
  docx_base64 text not null check(length(docx_base64) between 1 and 5600000),
  bindings jsonb not null default '[]'::jsonb check(jsonb_typeof(bindings) = 'array'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists cv_report_formats_account_index
  on public.cv_report_formats(account_id);

alter table public.cv_report_formats enable row level security;
revoke all on public.cv_report_formats from public, anon;
grant select, insert, update, delete on public.cv_report_formats to authenticated;

-- A user may see report formats only for accessible templates in the selected
-- account; RLS protects even uploaded documents containing private customer data.
create policy cv_report_formats_read
on public.cv_report_formats for select to authenticated
using (
  account_id = public.cv_selected_account()
  and public.cv_can_use_template(template_id, false)
  and exists (
    select 1 from public.certificate_templates t
    where t.id = template_id and t.account_id = cv_report_formats.account_id
  )
);

-- Owners/admins can edit all organization templates. Delegated members can edit
-- only their own templates, exactly as the existing template designer does.
create policy cv_report_formats_add
on public.cv_report_formats for insert to authenticated
with check (
  account_id = public.cv_selected_account()
  and created_by = (select auth.uid())
  and public.cv_can_use_template(template_id, true)
  and exists (
    select 1 from public.certificate_templates t
    where t.id = template_id and t.account_id = cv_report_formats.account_id
  )
);

create policy cv_report_formats_edit
on public.cv_report_formats for update to authenticated
using (
  account_id = public.cv_selected_account()
  and public.cv_can_use_template(template_id, true)
)
with check (
  account_id = public.cv_selected_account()
  and public.cv_can_use_template(template_id, true)
  and exists (
    select 1 from public.certificate_templates t
    where t.id = template_id and t.account_id = cv_report_formats.account_id
  )
);

-- Reuse the existing permission function rather than widening account or team
-- privileges. No public/anonymous API or document access.
comment on table public.cv_report_formats is 'Private DOCX report format and visual field mappings for one CertVerify template';
commit;
