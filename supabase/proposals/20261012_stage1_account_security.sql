-- REVIEW CANDIDATE, NOT A PRODUCTION MIGRATION. See docs/stage-1.md.
-- Inspect live function bodies/grants/triggers and reconcile the schema first.
begin;

alter table public.account_invitations add column if not exists requires_setup boolean not null default false;

alter table public.certificate_templates add column if not exists account_id uuid references public.accounts(id);
-- Intentionally do not guess which account owns historical templates.
-- A reviewed mapping must backfill account_id before production rollout.
create index if not exists certificate_templates_account_idx on public.certificate_templates(account_id);

create table public.cv_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  actor_id uuid not null,
  action text not null,
  subject_id uuid,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);
alter table public.cv_audit_events enable row level security;
revoke all on public.cv_audit_events from public, anon, authenticated;
grant select on public.cv_audit_events to authenticated;

create function public.cv_account_role(p_account_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.account_members m
  where m.account_id = p_account_id and m.user_id = auth.uid() and m.status = 'active'
$$;

create function public.cv_selected_account() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_header text; v_account uuid;
begin
  v_header := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-certverify-account';
  if v_header is null or v_header !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  v_account := v_header::uuid;
  if public.cv_account_role(v_account) is null then return null; end if;
  return v_account;
end $$;

create function public.cv_list_accounts()
returns table(id uuid, account_name text, account_code text, account_type text, role text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.account_name, a.account_code, a.account_type, m.role
  from public.accounts a join public.account_members m on m.account_id = a.id
  where m.user_id = auth.uid() and m.status = 'active'
  order by m.joined_at, a.id
$$;

create function public.cv_require_admin() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_account uuid := public.cv_selected_account();
begin
  if v_account is null then raise exception 'Account access denied' using errcode = '42501'; end if;
  -- Serialize administrative transitions, acceptance and member removal per account.
  perform 1 from public.accounts where id = v_account for update;
  if coalesce(public.cv_account_role(v_account), '') not in ('owner', 'admin') then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return v_account;
end $$;

create function public.cv_upgrade_account() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_account uuid := public.cv_require_admin();
begin
  if public.cv_account_role(v_account) is distinct from 'owner' then raise exception 'Owner access required' using errcode = '42501'; end if;
  update public.accounts set account_type = 'organization', updated_at = clock_timestamp()
  where id = v_account and account_type = 'individual';
  if found then
    insert into public.cv_audit_events(account_id, actor_id, action, subject_id) values(v_account, auth.uid(), 'account.upgraded', v_account);
  end if;
  return true;
end $$;

create function public.cv_manage_member(p_member_id uuid, p_role text default null, p_remove boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_account uuid := public.cv_require_admin(); v_target public.account_members; v_actor_role text;
begin
  v_actor_role := public.cv_account_role(v_account);
  select * into v_target from public.account_members where id = p_member_id and account_id = v_account for update;
  if not found then raise exception 'Member not found' using errcode = '42501'; end if;
  if v_target.role = 'owner' then raise exception 'Owner changes require a separate ownership transfer'; end if;
  if v_actor_role = 'admin' and (v_target.role = 'admin' or p_role = 'admin') then
    raise exception 'Only owners can manage administrators' using errcode = '42501';
  end if;
  if p_remove then
    update public.account_members set status = 'removed', updated_at = clock_timestamp() where id = p_member_id;
  else
    if p_role is null or p_role not in ('admin', 'member') then raise exception 'Invalid role'; end if;
    if v_target.status <> 'active' then raise exception 'Member is not active'; end if;
    update public.account_members set role = p_role, updated_at = clock_timestamp() where id = p_member_id;
  end if;
  insert into public.cv_audit_events(account_id, actor_id, action, subject_id, details)
  values(v_account, auth.uid(), case when p_remove then 'member.removed' else 'member.role_changed' end,
    v_target.user_id, jsonb_build_object('previous_role', v_target.role, 'role', p_role));
  return true;
end $$;

create function public.cv_prepare_invitation(p_email text, p_token_hash text, p_previous_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_account uuid := public.cv_require_admin(); v_email text := lower(btrim(p_email)); v_id uuid; v_previous public.account_invitations; v_requires_setup boolean; v_recipient_id uuid;
begin
  if not exists(select 1 from public.accounts where id = v_account and account_type = 'organization') then raise exception 'An organization is required'; end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 254 then raise exception 'Invalid email'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation token'; end if;
  if exists(select 1 from auth.users where id = auth.uid() and lower(email) = v_email) then raise exception 'Cannot invite yourself'; end if;
  if exists(select 1 from public.account_members m join auth.users u on u.id = m.user_id
    where m.account_id = v_account and m.status = 'active' and lower(u.email) = v_email) then raise exception 'Already an active member'; end if;

  if p_previous_id is not null then
    select * into v_previous from public.account_invitations where id = p_previous_id and account_id = v_account for update;
    if not found or lower(v_previous.invited_email) <> v_email then raise exception 'Invitation not found' using errcode = '42501'; end if;
    if v_previous.status = 'accepted' then raise exception 'Invitation already accepted'; end if;
    update public.account_invitations set status = 'revoked', updated_at = clock_timestamp() where id = p_previous_id;
  end if;
  update public.account_invitations set status = 'expired', updated_at = clock_timestamp()
  where account_id = v_account and lower(invited_email) = v_email and status = 'pending' and expires_at <= clock_timestamp();
  if exists(select 1 from public.account_invitations where account_id = v_account and lower(invited_email) = v_email and status = 'pending') then
    raise exception 'A pending invitation already exists';
  end if;
  if (select count(*) from auth.users where lower(email) = v_email) > 1 then raise exception 'Ambiguous recipient account'; end if;
  select id into v_recipient_id from auth.users where lower(email) = v_email;
  v_requires_setup := coalesce(v_previous.requires_setup, false)
    or not exists(select 1 from auth.users where lower(email) = v_email)
    or exists(select 1 from auth.users where lower(email) = v_email
      and raw_user_meta_data ->> 'certverify_invitation_setup_required' = 'true');
  insert into public.account_invitations(account_id, invited_email, invited_role, invited_by, token_hash, status, expires_at, requires_setup, invited_user_id)
  values(v_account, v_email, 'member', auth.uid(), p_token_hash, 'pending', clock_timestamp() + interval '7 days', v_requires_setup, v_recipient_id) returning id into v_id;
  insert into public.cv_audit_events(account_id, actor_id, action, subject_id, details)
  values(v_account, auth.uid(), case when p_previous_id is null then 'invitation.created' else 'invitation.resent' end,
    v_id, jsonb_build_object('previous_invitation_id', p_previous_id));
  return v_id;
end $$;

create function public.cv_revoke_invitation(p_invitation_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_account uuid := public.cv_require_admin(); v_invitation public.account_invitations;
begin
  select * into v_invitation from public.account_invitations where id = p_invitation_id and account_id = v_account for update;
  if not found then raise exception 'Invitation not found' using errcode = '42501'; end if;
  if v_invitation.status = 'accepted' then raise exception 'Invitation already accepted'; end if;
  if v_invitation.status = 'revoked' then return true; end if;
  update public.account_invitations set status = 'revoked', updated_at = clock_timestamp() where id = p_invitation_id;
  insert into public.cv_audit_events(account_id, actor_id, action, subject_id) values(v_account, auth.uid(), 'invitation.revoked', p_invitation_id);
  return true;
end $$;

create function public.cv_accept_invitation(p_token_hash text, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_invitation public.account_invitations; v_user auth.users; v_account uuid; v_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
  select account_id into v_account from public.account_invitations where token_hash = p_token_hash;
  if v_account is null then raise exception 'Invalid invitation'; end if;
  perform 1 from public.accounts where id = v_account for update;
  select * into v_invitation from public.account_invitations where token_hash = p_token_hash for update;
  select * into v_user from auth.users where id = auth.uid();
  if v_user.email_confirmed_at is null or lower(v_user.email) is distinct from lower(v_invitation.invited_email)
    or (v_invitation.invited_user_id is not null and v_invitation.invited_user_id <> auth.uid()) then
    raise exception 'This invitation belongs to another verified user' using errcode = '42501';
  end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= clock_timestamp() then raise exception 'Invitation expired, revoked or already accepted'; end if;
  v_name := nullif(btrim(p_name), '');
  if v_invitation.requires_setup and (v_name is null or coalesce(v_user.encrypted_password, '') = '') then
    raise exception 'Complete your name and password setup before accepting';
  end if;
  if v_name is not null and (length(v_name) < 2 or length(v_name) > 120) then raise exception 'Invalid name'; end if;
  if v_name is not null then
    insert into public.profiles(user_id, professional_name, email) values(auth.uid(), v_name, v_user.email)
    on conflict(user_id) do update set professional_name = excluded.professional_name;
  end if;
  insert into public.account_members(account_id, user_id, role, status)
  values(v_account, auth.uid(), 'member', 'active')
  on conflict(account_id, user_id) do update set status = 'active',
    role = case when account_members.status = 'active' then account_members.role else 'member' end,
    updated_at = clock_timestamp();
  -- Active memberships retain their role; removed members return as members, never with their old admin privileges.
  update public.account_invitations set status = 'accepted', accepted_by = auth.uid(),
    invited_user_id = auth.uid(), accepted_at = clock_timestamp(), updated_at = clock_timestamp() where id = v_invitation.id;
  insert into public.cv_audit_events(account_id, actor_id, action, subject_id) values(v_account, auth.uid(), 'invitation.accepted', v_invitation.id);
  return v_account;
end $$;

create function public.cv_can_use_template(p_template_id uuid, p_manage boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.certificate_templates t where t.id = p_template_id
    and t.account_id = public.cv_selected_account()
    and (not p_manage or public.cv_account_role(t.account_id) in ('owner','admin')))
$$;

create function public.cv_can_use_certificate(p_certificate_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.certificates c where c.id = p_certificate_id
    and c.account_id = public.cv_selected_account()
    and (c.user_id = auth.uid() or public.cv_account_role(c.account_id) in ('owner','admin')))
$$;

create function public.cv_generate_certificate_id() returns text
language plpgsql security definer set search_path = '' as $$
declare v_account uuid := public.cv_selected_account();
begin
  if v_account is null or public.cv_account_role(v_account) not in ('owner','admin','member') then
    raise exception 'Account access denied' using errcode = '42501';
  end if;
  perform 1 from public.accounts where id = v_account for update;
  if public.cv_account_role(v_account) is null then raise exception 'Membership removed' using errcode = '42501'; end if;
  -- Retain the existing ID algorithm. Its body must be reviewed before deployment.
  return public.generate_certificate_id(v_account);
end $$;

-- Restrictive policies AND the existing policies, so old creator-only policies
-- cannot retain access after removal or expose data from an unselected account.
create policy cv_accounts_context on public.accounts as restrictive for select to authenticated
using (id = public.cv_selected_account());
create policy cv_members_context on public.account_members as restrictive for select to authenticated
using (account_id = public.cv_selected_account());
create policy cv_members_list on public.account_members for select to authenticated
using (account_id = public.cv_selected_account());
create policy cv_members_no_insert on public.account_members as restrictive for insert to authenticated with check(false);
create policy cv_members_no_update on public.account_members as restrictive for update to authenticated using(false) with check(false);
create policy cv_members_no_delete on public.account_members as restrictive for delete to authenticated using(false);

create policy cv_invitation_context on public.account_invitations as restrictive for all to authenticated
using (account_id = public.cv_selected_account() and public.cv_account_role(account_id) in ('owner','admin'))
with check(false);
create policy cv_invitation_no_delete on public.account_invitations as restrictive for delete to authenticated using(false);

create policy cv_template_scope on public.certificate_templates as restrictive for all to authenticated
using (account_id = public.cv_selected_account())
with check(account_id = public.cv_selected_account() and public.cv_account_role(account_id) in ('owner','admin'));
create policy cv_template_read on public.certificate_templates for select to authenticated using(account_id = public.cv_selected_account());
create policy cv_template_insert on public.certificate_templates for insert to authenticated
with check(user_id = auth.uid() and public.cv_account_role(account_id) in ('owner','admin'));
create policy cv_template_update on public.certificate_templates for update to authenticated
using(public.cv_can_use_template(id,true)) with check(public.cv_account_role(account_id) in ('owner','admin'));
create policy cv_template_delete on public.certificate_templates as restrictive for delete to authenticated using(public.cv_can_use_template(id,true));
create policy cv_template_delete_admin on public.certificate_templates for delete to authenticated using(public.cv_can_use_template(id,true));

create policy cv_fields_scope on public.certificate_fields as restrictive for all to authenticated
using(public.cv_can_use_template(template_id)) with check(public.cv_can_use_template(template_id,true));
create policy cv_fields_read on public.certificate_fields for select to authenticated using(public.cv_can_use_template(template_id));
create policy cv_fields_admin on public.certificate_fields for all to authenticated
using(public.cv_can_use_template(template_id,true)) with check(public.cv_can_use_template(template_id,true));
create policy cv_fields_delete_admin on public.certificate_fields as restrictive for delete to authenticated using(public.cv_can_use_template(template_id,true));

create policy cv_certificates_scope on public.certificates as restrictive for all to authenticated
using(public.cv_can_use_certificate(id))
with check(account_id = public.cv_selected_account() and user_id = auth.uid()
  and public.cv_account_role(account_id) in ('owner','admin','member') and public.cv_can_use_template(template_id));
create policy cv_values_scope on public.certificate_field_values as restrictive for all to authenticated
using(public.cv_can_use_certificate(certificate_id)) with check(public.cv_can_use_certificate(certificate_id));
create policy cv_verifications_scope on public.certificate_verifications as restrictive for select to authenticated
using(public.cv_can_use_certificate(certificate_id));
create policy cv_audit_read on public.cv_audit_events for select to authenticated
using(account_id = public.cv_selected_account() and public.cv_account_role(account_id) in ('owner','admin'));

-- Remove direct mutation paths superseded by these transactional RPCs. This is
-- proposed only: the live bodies and all callers must be inventoried before apply.
do $$ declare f record;
begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
    ('accept_account_invitation','create_account_invitation','revoke_account_invitation','upgrade_account_to_organization','generate_certificate_id','revoke_certificate')
  loop execute format('revoke execute on function %s from public, anon, authenticated', f.signature); end loop;
end $$;

-- No new SECURITY DEFINER entrypoint inherits PostgreSQL's default PUBLIC grant.
do $$ declare f record;
begin
  for f in select p.oid::regprocedure as signature, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'cv_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.signature);
    if f.proname <> 'cv_require_admin' then execute format('grant execute on function %s to authenticated', f.signature); end if;
  end loop;
end $$;
commit;
