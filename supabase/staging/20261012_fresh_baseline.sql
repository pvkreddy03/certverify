-- FRESH STAGING ONLY, UNAPPLIED. Never execute against the protected source.
-- Reuses reviewed snapshot column/constraint shapes; replaces missing legacy bodies
-- with explicit fresh-install implementations. NOT an existing-database migration.
-- Requires genuine Supabase-managed auth/users, auth.uid(), Storage schemas/roles.
begin;
do $$ begin
 if to_regclass('public.accounts') is not null or to_regclass('public.certificates') is not null then
   raise exception 'Fresh staging baseline refuses an existing application database';
 end if;
 if to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null or to_regclass('storage.objects') is null then
   raise exception 'Supabase-managed Auth/Storage prerequisites required';
 end if;
 if exists(select 1 from auth.users) then
   raise exception 'Fresh staging requires empty Auth users; reconcile prior signups before applying';
 end if;
end $$;
revoke create on schema public from public,anon,authenticated,service_role;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated,service_role;
alter default privileges in schema public revoke all on tables from public,anon,authenticated,service_role;
create table public."account_invitations" (
  "id" uuid default gen_random_uuid() not null,
  "account_id" uuid not null,
  "invited_email" text not null,
  "invited_role" text default 'member'::text not null,
  "invited_by" uuid not null,
  "token_hash" text not null,
  "status" text default 'pending'::text not null,
  "expires_at" timestamp with time zone not null,
  "accepted_at" timestamp with time zone,
  "accepted_by" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "invited_user_id" uuid
);
alter table public."account_invitations" enable row level security;
revoke all on public."account_invitations" from public,anon,authenticated,service_role;
create table public."account_members" (
  "id" uuid default gen_random_uuid() not null,
  "account_id" uuid not null,
  "user_id" uuid not null,
  "role" text default 'member'::text not null,
  "status" text default 'active'::text not null,
  "joined_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table public."account_members" enable row level security;
revoke all on public."account_members" from public,anon,authenticated,service_role;
create table public."accounts" (
  "id" uuid default gen_random_uuid() not null,
  "account_type" text not null,
  "account_name" text not null,
  "account_code" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table public."accounts" enable row level security;
revoke all on public."accounts" from public,anon,authenticated,service_role;
create table public."certificate_field_values" (
  "id" uuid default gen_random_uuid() not null,
  "certificate_id" uuid not null,
  "field_name" text not null,
  "field_type" text default 'text'::text not null,
  "field_value" text,
  "is_public" boolean default true not null,
  "display_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
alter table public."certificate_field_values" enable row level security;
revoke all on public."certificate_field_values" from public,anon,authenticated,service_role;
create table public."certificate_fields" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "field_name" text not null,
  "field_type" text default 'text'::text not null,
  "is_required" boolean default false not null,
  "is_public" boolean default true not null,
  "display_order" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "template_id" uuid
);
alter table public."certificate_fields" enable row level security;
revoke all on public."certificate_fields" from public,anon,authenticated,service_role;
create table public."certificate_sequences" (
  "account_id" uuid not null,
  "user_id" uuid not null,
  "certificate_year" integer not null,
  "next_number" integer default 1 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table public."certificate_sequences" enable row level security;
revoke all on public."certificate_sequences" from public,anon,authenticated,service_role;
create table public."certificate_templates" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "name" text not null,
  "description" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
alter table public."certificate_templates" enable row level security;
revoke all on public."certificate_templates" from public,anon,authenticated,service_role;
create table public."certificate_verifications" (
  "id" uuid default gen_random_uuid() not null,
  "certificate_id" uuid not null,
  "verified_at" timestamp with time zone default now() not null
);
alter table public."certificate_verifications" enable row level security;
revoke all on public."certificate_verifications" from public,anon,authenticated,service_role;
create table public."certificates" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "certificate_id" text not null,
  "client" text,
  "valuation_date" date,
  "purpose" text,
  "owner_name" text,
  "location" text,
  "price_per_sq_meter" numeric,
  "total_property_value" numeric,
  "status" text default 'Active'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "property_type" text,
  "property_area" numeric,
  "template_id" uuid,
  "account_id" uuid,
  "template_name" text
);
alter table public."certificates" enable row level security;
revoke all on public."certificates" from public,anon,authenticated,service_role;
create table public."profiles" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "professional_name" text not null,
  "email" text,
  "created_at" timestamp with time zone default now() not null,
  "user_code" text
);
alter table public."profiles" enable row level security;
revoke all on public."profiles" from public,anon,authenticated,service_role;
alter table public."account_invitations" add constraint "account_invitations_invited_role_check" CHECK ((invited_role = 'member'::text));
alter table public."account_invitations" add constraint "account_invitations_pkey" PRIMARY KEY (id);
alter table public."account_invitations" add constraint "account_invitations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'expired'::text, 'revoked'::text])));
alter table public."account_invitations" add constraint "account_invitations_token_hash_key" UNIQUE (token_hash);
alter table public."account_members" add constraint "account_members_account_id_user_id_key" UNIQUE (account_id, user_id);
alter table public."account_members" add constraint "account_members_pkey" PRIMARY KEY (id);
alter table public."account_members" add constraint "account_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text])));
alter table public."account_members" add constraint "account_members_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'removed'::text])));
alter table public."accounts" add constraint "accounts_account_code_key" UNIQUE (account_code);
alter table public."accounts" add constraint "accounts_account_type_check" CHECK ((account_type = ANY (ARRAY['individual'::text, 'organization'::text])));
alter table public."accounts" add constraint "accounts_pkey" PRIMARY KEY (id);
alter table public."certificate_field_values" add constraint "certificate_field_values_pkey" PRIMARY KEY (id);
alter table public."certificate_fields" add constraint "certificate_fields_pkey" PRIMARY KEY (id);
alter table public."certificate_sequences" add constraint "certificate_sequences_next_number_check" CHECK ((next_number >= 1));
alter table public."certificate_sequences" add constraint "certificate_sequences_pkey" PRIMARY KEY (account_id, user_id, certificate_year);
alter table public."certificate_templates" add constraint "certificate_templates_pkey" PRIMARY KEY (id);
alter table public."certificate_verifications" add constraint "certificate_verifications_pkey" PRIMARY KEY (id);
alter table public."certificates" add constraint "certificates_pkey" PRIMARY KEY (id);
alter table public."certificates" add constraint "certificates_user_certificate_id_unique" UNIQUE (user_id, certificate_id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_user_id_key" UNIQUE (user_id);
alter table public."account_invitations" add constraint "account_invitations_accepted_by_fkey" FOREIGN KEY (accepted_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."account_invitations" add constraint "account_invitations_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
alter table public."account_invitations" add constraint "account_invitations_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."account_invitations" add constraint "account_invitations_invited_user_id_fkey" FOREIGN KEY (invited_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."account_members" add constraint "account_members_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
alter table public."account_members" add constraint "account_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."certificate_field_values" add constraint "certificate_field_values_certificate_id_fkey" FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE CASCADE;
alter table public."certificate_fields" add constraint "certificate_fields_template_id_fkey" FOREIGN KEY (template_id) REFERENCES certificate_templates(id) ON DELETE CASCADE;
alter table public."certificate_fields" add constraint "certificate_fields_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."certificate_sequences" add constraint "certificate_sequences_account_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
alter table public."certificate_sequences" add constraint "certificate_sequences_user_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."certificate_templates" add constraint "certificate_templates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."certificate_verifications" add constraint "certificate_verifications_certificate_id_fkey" FOREIGN KEY (certificate_id) REFERENCES certificates(id) ON DELETE CASCADE;
alter table public."certificates" add constraint "certificates_account_id_fkey" FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
alter table public."certificates" add constraint "certificates_template_id_fkey" FOREIGN KEY (template_id) REFERENCES certificate_templates(id) ON DELETE SET NULL;
alter table public."certificates" add constraint "certificates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
alter table public."profiles" add constraint "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE INDEX account_invitations_account_id_idx ON public.account_invitations USING btree (account_id);
CREATE INDEX account_invitations_expires_at_idx ON public.account_invitations USING btree (expires_at);
CREATE INDEX account_invitations_invited_email_idx ON public.account_invitations USING btree (lower(invited_email));
CREATE INDEX account_invitations_invited_user_id_idx ON public.account_invitations USING btree (invited_user_id);
CREATE UNIQUE INDEX account_invitations_pending_email_unique ON public.account_invitations USING btree (account_id, lower(invited_email)) WHERE (status = 'pending'::text);
CREATE INDEX account_invitations_status_idx ON public.account_invitations USING btree (status);
CREATE INDEX idx_account_members_account_id ON public.account_members USING btree (account_id);
CREATE INDEX idx_account_members_status ON public.account_members USING btree (status);
CREATE INDEX idx_account_members_user_id ON public.account_members USING btree (user_id);
CREATE INDEX certificate_verifications_certificate_id_idx ON public.certificate_verifications USING btree (certificate_id);
CREATE INDEX certificate_verifications_verified_at_idx ON public.certificate_verifications USING btree (verified_at);
CREATE UNIQUE INDEX certificates_certificate_id_unique ON public.certificates USING btree (certificate_id);
CREATE UNIQUE INDEX profiles_user_code_unique ON public.profiles USING btree (user_code) WHERE (user_code IS NOT NULL);

-- Random public issuer code; never encodes auth user IDs, email or private fields.
alter table public.accounts alter column account_code set default ('AC-'||replace(gen_random_uuid()::text,'-',''));
alter table public.accounts alter column account_code set not null;
alter table public.profiles alter column user_code set default ('PR-'||replace(gen_random_uuid()::text,'-',''));

create function public.is_active_account_member(requested_account_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_members m join auth.users u on u.id=m.user_id
 where m.account_id=requested_account_id and m.user_id=auth.uid() and m.status='active'
 and u.email_confirmed_at is not null)
$$;
create function public.is_account_admin(requested_account_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_active_account_member(requested_account_id) and exists(
 select 1 from public.account_members where account_id=requested_account_id and user_id=auth.uid() and role in ('owner','admin') and status='active')
$$;
revoke all on function public.is_active_account_member(uuid),public.is_account_admin(uuid) from public,anon,authenticated,service_role;
grant execute on function public.is_active_account_member(uuid),public.is_account_admin(uuid) to authenticated;

grant select on public.accounts,public.account_members,public.account_invitations,public.profiles,public.certificate_verifications to authenticated;
grant select,insert,update on public.certificates,public.certificate_field_values to authenticated;
grant select,insert,update,delete on public.certificate_templates,public.certificate_fields to authenticated;
-- Stage 1 adds restrictive selected-context policies; these supply permissive baselines.
create policy staging_accounts_read on public.accounts for select to authenticated using(public.is_active_account_member(id));
create policy staging_members_read on public.account_members for select to authenticated using(public.is_active_account_member(account_id));
create policy staging_invitation_read on public.account_invitations for select to authenticated using(public.is_account_admin(account_id));
create policy staging_profiles_read on public.profiles for select to authenticated using(user_id=auth.uid());
create policy staging_certificates_read on public.certificates for select to authenticated using(public.is_active_account_member(account_id));
create policy staging_certificates_insert on public.certificates for insert to authenticated with check(user_id=auth.uid() and public.is_active_account_member(account_id));
create policy staging_certificates_update on public.certificates for update to authenticated using(public.is_account_admin(account_id)) with check(public.is_account_admin(account_id));
create policy staging_values_write on public.certificate_field_values for all to authenticated
 using(exists(select 1 from public.certificates c where c.id=certificate_field_values.certificate_id and public.is_active_account_member(c.account_id)))
 with check(exists(select 1 from public.certificates c where c.id=certificate_field_values.certificate_id and public.is_active_account_member(c.account_id)));
create policy staging_verifications_read on public.certificate_verifications for select to authenticated
 using(exists(select 1 from public.certificates c where c.id=certificate_verifications.certificate_id and public.is_active_account_member(c.account_id)));

create table public.staging_certificate_counters (
 account_id uuid references public.accounts(id) on delete restrict,
 certificate_year integer not null,next_number bigint not null check(next_number>0),
 primary key(account_id,certificate_year)
);
alter table public.staging_certificate_counters enable row level security;
revoke all on public.staging_certificate_counters from public,anon,authenticated,service_role;
create function public.generate_certificate_id(p_account_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare issuer text; year integer:=extract(year from timezone('UTC',clock_timestamp())); number bigint;
begin
 -- Stage 1 installs these checked functions before this helper is used.
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
   raise exception 'Confirmed issuer account required' using errcode='42501';
 end if;
 if p_account_id is distinct from public.cv_selected_account() or public.cv_account_role(p_account_id) not in ('owner','admin','member') then
   raise exception 'Selected active issuer membership required' using errcode='42501';
 end if;
 select account_code into issuer from public.accounts where id=p_account_id for update;
 if issuer is null or public.cv_account_role(p_account_id) is null then raise exception 'Issuer unavailable' using errcode='42501';end if;
 insert into public.staging_certificate_counters(account_id,certificate_year,next_number) values(p_account_id,year,2)
 on conflict(account_id,certificate_year) do update set next_number=public.staging_certificate_counters.next_number+1
 returning next_number-1 into number;
 return issuer||'-'||year::text||'-'||case when length(number::text)<8 then lpad(number::text,8,'0') else number::text end;
end $$;
revoke all on function public.generate_certificate_id(uuid) from public,anon,authenticated,service_role;

create function public.staging_handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
declare name text:=nullif(btrim(new.raw_user_meta_data->>'professional_name'),'');account uuid;
begin
 -- Metadata may initialize a display name only, never roles, prices or admin grants.
 if name is null or length(name) not between 2 and 120 then name:='Professional account';end if;
 insert into public.profiles(user_id,professional_name,email) values(new.id,name,new.email);
 insert into public.accounts(account_name,account_type) values(name,'individual') returning id into account;
 insert into public.account_members(account_id,user_id,role,status) values(account,new.id,'owner','active');
 return new;
end $$;
revoke all on function public.staging_handle_new_user() from public,anon,authenticated,service_role;
create trigger staging_auth_user_created after insert on auth.users for each row execute function public.staging_handle_new_user();
-- No seed users/admins/prices/paid entitlements; signup creates one personal account.
commit;
