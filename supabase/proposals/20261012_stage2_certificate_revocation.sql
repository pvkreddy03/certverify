-- UNAPPLIED REVIEW PROPOSAL. Requires reviewed Stage 1 and live schema inspection.
begin;

alter table public.certificates
  add column public_verification_id uuid not null default gen_random_uuid(),
  add column revoked_at timestamptz,
  add column revoked_by uuid,
  add column revoked_account_id uuid references public.accounts(id),
  add column revocation_previous_status text,
  add column revocation_reason text,
  add column public_revocation_reason text,
  add column replaces_certificate_id uuid references public.certificates(id) on delete restrict;
create unique index cv_certificate_public_id_unique on public.certificates(public_verification_id);
create index cv_certificate_legacy_reference_idx on public.certificates(certificate_id);
-- Inline row attributes are required for INSERT ... RETURNING: a STABLE helper
-- querying the same table cannot see the newly inserted row in that statement.
drop policy cv_certificates_scope on public.certificates;
create policy cv_certificates_scope on public.certificates as restrictive for all to authenticated
using(account_id=public.cv_selected_account() and (user_id=auth.uid() or public.cv_account_role(account_id) in ('owner','admin')))
with check(account_id=public.cv_selected_account() and user_id=auth.uid()
  and public.cv_account_role(account_id) in ('owner','admin','member') and public.cv_can_use_template(template_id));
alter table public.certificates add constraint cv_certificate_status_valid
  check(status in ('Active','Inactive','Revoked')) not valid;
-- Historical revoked rows remain visible but must be reconciled before validating
-- this constraint. Never invent historical reasons/actors/timestamps.
alter table public.certificates add constraint cv_revocation_evidence_required check (
  status <> 'Revoked' or (revoked_at is not null and revoked_by is not null
  and revoked_account_id is not null and account_id is not null and revoked_account_id = account_id
  and revocation_previous_status is not null and revocation_previous_status in ('Active','Inactive')
  and nullif(btrim(revocation_reason),'') is not null)
) not valid;

create function public.cv_certificate_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_original public.certificates;
begin
  if tg_op = 'DELETE' then raise exception 'Certificate history cannot be deleted'; end if;
  if tg_op = 'INSERT' then
    if tg_when='BEFORE' then
      new.created_at := clock_timestamp();
      new.updated_at := new.created_at;
    end if;
    if new.status not in ('Active','Inactive') or new.revoked_at is not null or new.revoked_by is not null
      or new.revocation_reason is not null or new.public_revocation_reason is not null
      or new.revoked_account_id is not null or new.revocation_previous_status is not null then
      raise exception 'Issue a certificate before revoking it';
    end if;
    if new.replaces_certificate_id is not null then
      select * into v_original from public.certificates where id = new.replaces_certificate_id for share;
      if not found or v_original.status <> 'Revoked' or v_original.account_id is distinct from new.account_id
        or new.replaces_certificate_id = new.id or not public.cv_can_use_certificate(v_original.id) then
        raise exception 'A replacement must reference an accessible revoked certificate in the same account' using errcode='42501';
      end if;
    end if;
    return new;
  end if;
  if new.id is distinct from old.id or new.account_id is distinct from old.account_id
    or new.user_id is distinct from old.user_id or new.certificate_id is distinct from old.certificate_id
    or new.public_verification_id is distinct from old.public_verification_id
    or new.created_at is distinct from old.created_at or new.replaces_certificate_id is distinct from old.replaces_certificate_id then
    raise exception 'Certificate identity and issuance history are immutable';
  end if;
  if old.status = 'Revoked' and new is distinct from old then raise exception 'Revoked certificates are immutable; issue a linked replacement'; end if;
  if new.status is distinct from old.status then
    if old.account_id is distinct from public.cv_selected_account()
      or coalesce(public.cv_account_role(old.account_id),'') not in ('owner','admin') then
      raise exception 'Account administrator access required' using errcode='42501';
    end if;
    if new.status not in ('Active','Inactive','Revoked') then raise exception 'Invalid certificate status'; end if;
  end if;
  return new;
end $$;
create trigger cv_certificate_guard before insert or update or delete on public.certificates
for each row execute function public.cv_certificate_guard();
-- Check final row values too, so another existing BEFORE trigger cannot alter
-- issuance identity or revoked history after the first guard has run.
create trigger cv_certificate_final_guard after insert or update on public.certificates
for each row execute function public.cv_certificate_guard();

-- All application status updates use the atomic, audited RPC. Direct deletion is
-- blocked, retaining history and preserving any future consumed quota.
revoke update,delete on public.certificates from public,anon,authenticated;

create function public.cv_change_certificate_status(p_certificate_id uuid, p_status text,
  p_reason text default null, p_public_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_account uuid := public.cv_require_admin(); v_certificate public.certificates;
  v_reason text := nullif(btrim(p_reason),''); v_public text := nullif(btrim(p_public_reason),''); v_previous text;
begin
  if p_status is null or p_status not in ('Active','Inactive','Revoked') then raise exception 'Invalid certificate status'; end if;
  if length(v_reason) > 2000 or length(v_public) > 500 then raise exception 'Reason is too long'; end if;
  select * into v_certificate from public.certificates where id=p_certificate_id and account_id=v_account for update;
  if not found then raise exception 'Certificate not found in the selected account' using errcode='42501'; end if;
  if v_certificate.status = 'Revoked' then
    if p_status <> 'Revoked' then raise exception 'Revoked certificates cannot be reactivated'; end if;
    -- Idempotent retries retain the first reason, actor, time and audit event.
    return jsonb_build_object('id',v_certificate.id,'status','Revoked','revoked_at',v_certificate.revoked_at);
  end if;
  if p_status='Revoked' and v_reason is null then raise exception 'A revocation reason is required'; end if;
  if p_status <> 'Revoked' and v_public is not null then raise exception 'Public revocation text applies only to revocation'; end if;
  if p_status=v_certificate.status then return jsonb_build_object('id',v_certificate.id,'status',v_certificate.status); end if;
  v_previous := v_certificate.status;
  update public.certificates set status=p_status, updated_at=clock_timestamp(),
    revoked_at=case when p_status='Revoked' then clock_timestamp() else null end,
    revoked_by=case when p_status='Revoked' then auth.uid() else null end,
    revoked_account_id=case when p_status='Revoked' then v_account else null end,
    revocation_previous_status=case when p_status='Revoked' then v_previous else null end,
    revocation_reason=case when p_status='Revoked' then v_reason else null end,
    public_revocation_reason=case when p_status='Revoked' then v_public else null end
  where id=p_certificate_id returning * into v_certificate;
  insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details)
  values(v_account,auth.uid(),case when p_status='Revoked' then 'certificate.revoked' else 'certificate.status_changed' end,
    p_certificate_id,jsonb_build_object('previous_status',v_previous,'status',p_status,'reason',v_reason));
  return jsonb_build_object('id',v_certificate.id,'status',v_certificate.status,'revoked_at',v_certificate.revoked_at);
end $$;

-- Read-only, explicit public projection: never exposes private reasons, actors,
-- account IDs, creator IDs or fields marked private. No subscription gate.
create function public.cv_public_certificate(p_reference text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_certificate public.certificates; v_fields jsonb; v_matches integer; v_issuer text;
begin
  if p_reference is null or length(p_reference) > 256 then return null; end if;
  if p_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_certificate from public.certificates where public_verification_id=p_reference::uuid;
  end if;
  if v_certificate.id is null then
    select count(*) into v_matches from public.certificates where certificate_id=p_reference;
    -- Preserve the existing global unique index on human-readable IDs. If a
    -- historical schema lacks it or has drifted, ambiguous links fail closed.
    if v_matches <> 1 then return null; end if;
    select * into v_certificate from public.certificates where certificate_id=p_reference;
  end if;
  if v_certificate.status not in ('Active','Inactive','Revoked') then return null; end if;
  select account_name into v_issuer from public.accounts where id=v_certificate.account_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'field_name',field_name,'field_type',field_type,
    'field_value',field_value,'display_order',display_order) order by display_order,id),'[]'::jsonb)
  into v_fields from public.certificate_field_values where certificate_id=v_certificate.id and is_public=true;
  return jsonb_build_object('public_verification_id',v_certificate.public_verification_id,'certificate_id',v_certificate.certificate_id,
    'issuer_name',v_issuer,'issued_at',v_certificate.created_at,'status',v_certificate.status,
    'revoked_at',v_certificate.revoked_at,'public_revocation_reason',v_certificate.public_revocation_reason,'fields',v_fields);
end $$;

-- Prevent alternate public table queries from retrieving confidential legacy columns.
revoke all on public.certificates,public.certificate_field_values from public,anon;
do $$ declare t text; columns text;
begin
  foreach t in array array['certificates','certificate_field_values'] loop
    select string_agg(quote_ident(attname),',') into columns from pg_attribute
      where attrelid=format('public.%I',t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke select (%s) on public.%I from public,anon',columns,t);
    if t='certificates' then execute format('revoke update (%s) on public.%I from public,anon,authenticated',columns,t); end if;
  end loop;
end $$;
revoke execute on function public.cv_certificate_guard() from public,anon,authenticated;
revoke execute on function public.cv_change_certificate_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.cv_change_certificate_status(uuid,text,text,text) to authenticated;
revoke execute on function public.cv_public_certificate(text) from public,anon,authenticated;
grant execute on function public.cv_public_certificate(text) to anon,authenticated;

-- Protect field evidence once the certificate has been revoked. A definer helper
-- avoids creator-only policies retaining mutation access or RLS recursion.
create function public.cv_certificate_fields_writable(p_certificate_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.certificates where id=p_certificate_id and status <> 'Revoked'
    and account_id=public.cv_selected_account() and user_id=auth.uid())
$$;
revoke execute on function public.cv_certificate_fields_writable(uuid) from public,anon,authenticated;
grant execute on function public.cv_certificate_fields_writable(uuid) to authenticated;
create policy cv_values_not_revoked_insert on public.certificate_field_values as restrictive for insert to authenticated
with check(public.cv_certificate_fields_writable(certificate_id));
create policy cv_values_not_revoked_update on public.certificate_field_values as restrictive for update to authenticated
using(public.cv_certificate_fields_writable(certificate_id)) with check(public.cv_certificate_fields_writable(certificate_id));
create policy cv_values_not_revoked_delete on public.certificate_field_values as restrictive for delete to authenticated
using(public.cv_certificate_fields_writable(certificate_id));

create function public.cv_certificate_fields_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_account uuid := public.cv_selected_account(); v_certificate_id uuid; v_certificate public.certificates;
begin
  if v_account is null then raise exception 'Account access denied' using errcode='42501'; end if;
  if tg_op='UPDATE' and new.certificate_id is distinct from old.certificate_id then raise exception 'Certificate field identity is immutable'; end if;
  v_certificate_id := case when tg_op='DELETE' then old.certificate_id else new.certificate_id end;
  -- Share locks serialize evidence edits against revocation/member-removal, which
  -- acquire an account update lock before the certificate lock.
  perform 1 from public.accounts where id=v_account for share;
  if public.cv_account_role(v_account) is null then raise exception 'Membership removed' using errcode='42501'; end if;
  select * into v_certificate from public.certificates where id=v_certificate_id and account_id=v_account for share;
  if not found or v_certificate.status='Revoked' then raise exception 'Revoked or inaccessible certificate fields are immutable' using errcode='42501'; end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger cv_certificate_fields_guard before insert or update or delete on public.certificate_field_values
for each row execute function public.cv_certificate_fields_guard();
revoke execute on function public.cv_certificate_fields_guard() from public,anon,authenticated;

commit;
