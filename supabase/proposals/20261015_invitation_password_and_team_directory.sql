-- CertVerify staging proposal: authenticated invitation setup and tenant-scoped member directory.
-- No production DB access is needed. Review this separately before a production rollout.

create or replace function public.cv_team_member_directory()
returns table(id uuid, user_id uuid, email text, role text, status text, joined_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.id, m.user_id, u.email::text, m.role::text, m.status::text, m.joined_at
  from public.account_members m
  join auth.users u on u.id = m.user_id
  where m.account_id = public.cv_selected_account()
    and public.cv_auth_identity_active()
    and public.cv_account_role(m.account_id) in ('owner','admin','member')
    and (public.cv_account_role(m.account_id) in ('owner','admin') or m.user_id = auth.uid())
  order by m.joined_at, m.id;
$$;
revoke all on function public.cv_team_member_directory() from public, anon;
grant execute on function public.cv_team_member_directory() to authenticated;

create or replace function public.cv_invitation_setup_required(p_token_hash text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare invitation public.account_invitations;
declare recipient auth.users;
begin
  if not public.cv_auth_identity_active() then
    raise exception 'Verified account required' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid invitation' using errcode = '42501';
  end if;
  select * into invitation from public.account_invitations
  where token_hash = p_token_hash and status = 'pending'
    and expires_at > clock_timestamp();
  select * into recipient from auth.users where id = auth.uid();
  if not found or invitation.id is null
      or lower(recipient.email) is distinct from lower(invitation.invited_email)
      or (invitation.invited_user_id is not null and invitation.invited_user_id <> auth.uid()) then
    raise exception 'Invitation is not available for this account' using errcode = '42501';
  end if;
  return invitation.requires_setup or coalesce(recipient.encrypted_password,'') = '';
end;
$$;
revoke all on function public.cv_invitation_setup_required(text) from public, anon;
grant execute on function public.cv_invitation_setup_required(text) to authenticated;

-- A direct call to the older acceptance RPC must not bypass password setup.
-- This trigger runs inside the acceptance transaction. Rejecting the status
-- transition rolls back any membership insert made earlier in that transaction.
create or replace function public.cv_require_invitee_password()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted'
    and (new.accepted_by is null or
      not exists(
        select 1 from auth.users u
        where u.id = new.accepted_by
          and u.email_confirmed_at is not null
          and coalesce(u.encrypted_password,'') <> ''
      )) then
    raise exception 'Set a password before accepting the invitation' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists cv_require_invitee_password_before_accept on public.account_invitations;
create trigger cv_require_invitee_password_before_accept
before update of status on public.account_invitations
for each row execute function public.cv_require_invitee_password();
