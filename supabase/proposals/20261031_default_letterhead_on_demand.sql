begin;
alter table public.cv_cover_letter_templates
  add column if not exists is_default boolean not null default false;
alter table public.cv_cover_letter_templates
  add constraint cv_cover_default_must_be_general check
  (not is_default or (template_id is null and report_format_id is null));
create unique index if not exists cv_one_default_cover_per_account
  on public.cv_cover_letter_templates (account_id) where is_default = true;
-- Existing general letterheads: automatically choose the oldest one as the account's
-- default, without altering template/report-specific cover formats.
with candidates as (
  select id, row_number() over (partition by account_id order by created_at, id) as n
  from public.cv_cover_letter_templates
  where template_id is null and report_format_id is null
), firsts as (
  select id from candidates where n=1
)
update public.cv_cover_letter_templates set is_default=true
where id in (select id from firsts)
and not exists (select 1 from public.cv_cover_letter_templates prior
                where prior.account_id=cv_cover_letter_templates.account_id
                  and prior.is_default);
create or replace function public.cv_choose_default_letterhead(p_letterhead uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_account uuid;
begin
  v_account := public.cv_selected_account();
  if v_account is null
     or public.cv_account_role(v_account) not in ('owner','admin') then
    raise exception 'Only a workspace administrator may change the default letterhead'
    using errcode='42501';
  end if;
  if not exists (
    select 1 from public.cv_cover_letter_templates
    where id=p_letterhead and account_id=v_account
    and template_id is null and report_format_id is null
  ) then
    raise exception 'Choose a general letterhead in your workspace'
    using errcode='42501';
  end if;
  update public.cv_cover_letter_templates
  set is_default = false where account_id=v_account and is_default=true;
  update public.cv_cover_letter_templates
  set is_default = true where account_id=v_account and id=p_letterhead;
end $$;
revoke all on function public.cv_choose_default_letterhead(uuid) from public,anon;
grant execute on function public.cv_choose_default_letterhead(uuid) to authenticated;
comment on column public.cv_cover_letter_templates.is_default is
'General letterhead and saved QR placement automatically used by all certificates without a selected specialized cover. No generated documents are retained.';
commit;