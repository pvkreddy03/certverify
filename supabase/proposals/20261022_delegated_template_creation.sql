-- Staging: explicit, per-member right to design certificate templates.
-- Default remains deny. Owner/admin roles keep existing authority.
alter table public.account_members
  add column if not exists can_manage_templates boolean not null default false;

create or replace function public.cv_can_manage_templates(p_account uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = p_account
      and m.account_id = public.cv_selected_account()
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and public.cv_account_enabled(p_account)
      and public.cv_auth_identity_active()
      and (m.role in ('owner','admin') or (m.role='member' and m.can_manage_templates))
  );
$$;

create or replace function public.cv_can_use_template(p_template_id uuid, p_manage boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.certificate_templates t
    where t.id = p_template_id
      and t.account_id = public.cv_selected_account()
      and (not p_manage or public.cv_can_manage_templates(t.account_id))
  );
$$;

create or replace function public.cv_set_member_template_permission(p_member_id uuid, p_allowed boolean)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_account uuid := public.cv_require_admin();
        v_target public.account_members;
begin
  select * into v_target from public.account_members
  where id=p_member_id and account_id=v_account and status='active'
  for update;
  if not found then
    raise exception 'Active member not found for this organization' using errcode='42501';
  end if;
  if v_target.role <> 'member' then
    raise exception 'Only sub-user template permissions can be changed' using errcode='42501';
  end if;
  update public.account_members
    set can_manage_templates = p_allowed, updated_at = clock_timestamp()
    where id = p_member_id and account_id = v_account;
  insert into public.cv_audit_events(account_id, actor_id, action, subject_id, details)
    values(v_account, auth.uid(), 'member.template_permission_updated',
      v_target.user_id,
      jsonb_build_object('can_manage_templates',p_allowed,
                         'previous',v_target.can_manage_templates));
  return true;
end;
$$;

revoke all on function public.cv_can_manage_templates(uuid) from public, anon;
grant execute on function public.cv_can_manage_templates(uuid) to authenticated;
revoke all on function public.cv_set_member_template_permission(uuid,boolean) from public, anon;
grant execute on function public.cv_set_member_template_permission(uuid,boolean) to authenticated;

-- Narrow, additive insert/update/delete policies supplement existing owner/admin rules.
create policy cv_template_delegated_insert on public.certificate_templates
  for insert to authenticated
  with check (user_id=(select auth.uid()) and account_id=public.cv_selected_account()
              and public.cv_can_manage_templates(account_id));
create policy cv_template_delegated_update on public.certificate_templates
  for update to authenticated
  using (public.cv_can_use_template(id,true))
  with check (account_id=public.cv_selected_account()
              and public.cv_can_manage_templates(account_id));
create policy cv_template_delegated_delete on public.certificate_templates
  for delete to authenticated using (public.cv_can_use_template(id,true));
