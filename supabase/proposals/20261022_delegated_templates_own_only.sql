-- Scoped delegation: members may author and maintain only their own templates.
-- Account owners and administrators may still maintain all organization templates.
create or replace function public.cv_can_use_template(p_template_id uuid, p_manage boolean default false)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.certificate_templates t
    where t.id = p_template_id
      and t.account_id = public.cv_selected_account()
      and (
        not p_manage
        or public.cv_account_role(t.account_id) in ('owner', 'admin')
        or (t.user_id = (select auth.uid()) and public.cv_can_manage_templates(t.account_id))
      )
  );
$$;

drop policy if exists cv_template_delegated_update on public.certificate_templates;
create policy cv_template_delegated_update on public.certificate_templates
  for update to authenticated
  using (public.cv_can_use_template(id,true))
  with check (
    account_id = public.cv_selected_account()
    and public.cv_can_manage_templates(account_id)
    and (
      public.cv_account_role(account_id) in ('owner','admin')
      or user_id = (select auth.uid())
    )
  );
