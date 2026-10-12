-- UNAPPLIED PROPOSAL. Inspect live schema/Storage policies and apply only in an isolated project first.
begin;
create table public.cv_platform_admins(user_id uuid primary key, active boolean not null default true,
  granted_by uuid, granted_at timestamptz not null default clock_timestamp());
alter table public.cv_platform_admins enable row level security;
revoke all on public.cv_platform_admins from public,anon,authenticated;
create function public.cv_platform_identity() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.cv_platform_admins p join auth.users u on u.id=p.user_id
    where p.user_id=auth.uid() and p.active and u.email_confirmed_at is not null)
$$;
create function public.cv_is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
  select public.cv_platform_identity() and coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'aal','')='aal2'
$$;
create table public.cv_platform_audit_events(id uuid primary key default gen_random_uuid(),actor_id uuid not null,
  action text not null,account_id uuid,subject_id uuid,details jsonb not null default '{}',occurred_at timestamptz not null default clock_timestamp());
alter table public.cv_platform_audit_events enable row level security;
revoke all on public.cv_platform_audit_events from public,anon,authenticated;

create table public.cv_logo_assets(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.accounts(id),
  created_by uuid not null,storage_path text not null unique,state text not null default 'reserved' check(state in ('reserved','ready')),
  content_hash text,byte_size integer,mime_type text,created_at timestamptz not null default clock_timestamp(),unique(account_id,id));
create table public.cv_branding_versions(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.accounts(id),
  company_name text not null check(length(btrim(company_name)) between 2 and 160),professional_details text not null default '' check(length(professional_details)<=2000),
  logo_asset_id uuid,created_by uuid,approved_by uuid,created_at timestamptz not null default clock_timestamp(),
  origin text not null check(origin in ('baseline','approved')),unique(account_id,id),
  foreign key(account_id,logo_asset_id) references public.cv_logo_assets(account_id,id));
create table public.cv_account_branding(account_id uuid primary key references public.accounts(id),current_version_id uuid not null,
  foreign key(account_id,current_version_id) references public.cv_branding_versions(account_id,id));
create table public.cv_branding_requests(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.accounts(id),
  base_version_id uuid not null,company_name text not null check(length(btrim(company_name)) between 2 and 160),
  professional_details text not null default '' check(length(professional_details)<=2000),logo_asset_id uuid,
  explanation text not null default '' check(length(explanation)<=2000),requested_by uuid not null,
  status text not null default 'pending' check(status in ('pending','needs_information','permission_granted','approved','rejected','cancelled')),
  reviewed_by uuid,reviewed_at timestamptz,decision_reason text,created_at timestamptz not null default clock_timestamp(),unique(account_id,id),
  foreign key(account_id,base_version_id) references public.cv_branding_versions(account_id,id),
  foreign key(account_id,logo_asset_id) references public.cv_logo_assets(account_id,id));
create unique index cv_branding_one_open_request on public.cv_branding_requests(account_id)
  where status in ('pending','needs_information','permission_granted');
create table public.cv_branding_permissions(id uuid primary key default gen_random_uuid(),account_id uuid not null,
  request_id uuid not null,user_id uuid not null,fields text[] not null,expires_at timestamptz not null,granted_by uuid not null,
  granted_at timestamptz not null default clock_timestamp(),used_at timestamptz,revoked_at timestamptz,revoked_by uuid,
  foreign key(account_id,request_id) references public.cv_branding_requests(account_id,id));
create table public.cv_certificate_branding(certificate_id uuid primary key references public.certificates(id) on delete restrict,
  account_id uuid not null,branding_version_id uuid not null,recorded_at timestamptz not null default clock_timestamp(),
  provenance text not null check(provenance in ('issuance','reviewed_historical')),
  foreign key(account_id,branding_version_id) references public.cv_branding_versions(account_id,id));

create function public.cv_validate_certificate_branding() returns trigger language plpgsql security definer set search_path='' as $$
 begin
   if not exists(select 1 from public.certificates where id=new.certificate_id and account_id=new.account_id) then
     raise exception 'Certificate branding must belong to its issuer account';
   end if;
   return new;
 end $$;
create trigger cv_validate_certificate_branding before insert on public.cv_certificate_branding for each row execute function public.cv_validate_certificate_branding();

create function public.cv_immutable_branding() returns trigger language plpgsql set search_path='' as $$
  begin raise exception 'Branding evidence is immutable'; end $$;
create trigger cv_versions_immutable before update or delete on public.cv_branding_versions for each row execute function public.cv_immutable_branding();
create trigger cv_certificate_branding_immutable before update or delete on public.cv_certificate_branding for each row execute function public.cv_immutable_branding();
create trigger cv_platform_audit_immutable before update or delete on public.cv_platform_audit_events for each row execute function public.cv_immutable_branding();

-- Existing current identity is a baseline, never guessed historical identity for issued certificates.
insert into public.cv_branding_versions(account_id,company_name,origin) select id,account_name,'baseline' from public.accounts;
insert into public.cv_account_branding(account_id,current_version_id) select account_id,id from public.cv_branding_versions;
create function public.cv_initialize_branding() returns trigger language plpgsql security definer set search_path='' as $$
  declare v_id uuid;
  begin
    insert into public.cv_branding_versions(account_id,company_name,created_by,origin) values(new.id,new.account_name,auth.uid(),'baseline') returning id into v_id;
    insert into public.cv_account_branding values(new.id,v_id); return new;
  end $$;
create trigger cv_initialize_branding after insert on public.accounts for each row execute function public.cv_initialize_branding();
create function public.cv_protect_account_name() returns trigger language plpgsql set search_path='' as $$
  begin if new.account_name is distinct from old.account_name then raise exception 'Use the approved branding workflow'; end if; return new; end $$;
create trigger cv_protect_account_name before update on public.accounts for each row execute function public.cv_protect_account_name();
create or replace function public.cv_list_accounts() returns table(id uuid,account_name text,account_code text,account_type text,role text)
 language sql stable security definer set search_path='' as $$
 select a.id,coalesce(v.company_name,a.account_name),a.account_code,a.account_type,m.role from public.accounts a
 join public.account_members m on m.account_id=a.id left join public.cv_account_branding b on b.account_id=a.id
 left join public.cv_branding_versions v on v.id=b.current_version_id
 where m.user_id=auth.uid() and m.status='active' order by m.joined_at,a.id $$;

create function public.cv_current_branding() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(v) from public.cv_account_branding b join public.cv_branding_versions v on v.id=b.current_version_id
 where b.account_id=public.cv_selected_account() $$;
create function public.cv_branding_changed_fields(p_request uuid) returns text[] language sql stable security definer set search_path='' as $$
 select array_remove(array[case when r.company_name is distinct from v.company_name then 'company_name' end,
 case when r.professional_details is distinct from v.professional_details then 'professional_details' end,
 case when r.logo_asset_id is distinct from v.logo_asset_id then 'logo' end],null)
 from public.cv_branding_requests r join public.cv_branding_versions v on v.id=r.base_version_id where r.id=p_request $$;

create function public.cv_reserve_logo() returns jsonb language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_selected_account(); i uuid:=gen_random_uuid(); p text;
 begin
   if a is null then raise exception 'Account access denied' using errcode='42501'; end if;
   perform 1 from public.accounts where id=a for update;
   if coalesce(public.cv_account_role(a),'') not in ('owner','admin') then raise exception 'Branding administrator required' using errcode='42501'; end if;
   if (select count(*) from public.cv_logo_assets where account_id=a and created_at>clock_timestamp()-interval '24 hours')>=10 then raise exception 'Daily logo upload limit reached'; end if;
   p:=a::text||'/'||i::text||'.webp';
   insert into public.cv_logo_assets(id,account_id,created_by,storage_path) values(i,a,auth.uid(),p);
   return jsonb_build_object('id',i,'path',p);
 end $$;
create function public.cv_finalize_logo(p_asset uuid,p_hash text,p_bytes integer) returns boolean language plpgsql security definer set search_path='' as $$
 declare l public.cv_logo_assets;
 begin
   if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'Trusted upload service required' using errcode='42501'; end if;
   select * into l from public.cv_logo_assets where id=p_asset;
   if not found then raise exception 'Invalid upload reservation'; end if;
   perform 1 from public.accounts where id=l.account_id for update;
   select * into l from public.cv_logo_assets where id=p_asset for update;
   if not found or l.state<>'reserved' then raise exception 'Invalid upload reservation'; end if;
   if p_hash !~ '^[0-9a-f]{64}$' or p_hash is null or p_bytes is null or p_bytes not between 1 and 2097152 then raise exception 'Invalid logo metadata'; end if;
   if not exists(select 1 from public.account_members where account_id=l.account_id and user_id=l.created_by and status='active' and role in ('owner','admin')) then raise exception 'Uploader access removed'; end if;
   if not exists(select 1 from storage.objects where bucket_id='certverify-branding' and name=l.storage_path
     and metadata->>'mimetype'='image/webp' and metadata->>'size'=p_bytes::text) then raise exception 'Sanitized Storage object missing'; end if;
   update public.cv_logo_assets set state='ready',content_hash=p_hash,byte_size=p_bytes,mime_type='image/webp' where id=p_asset;
   insert into public.cv_audit_events(account_id,actor_id,action,subject_id) values(l.account_id,l.created_by,'branding.logo_uploaded',l.id);
   return true;
 end $$;

create function public.cv_request_branding(p_name text,p_details text,p_logo uuid,p_explanation text) returns uuid
 language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_require_admin(); v uuid; r uuid;
 begin
   select current_version_id into v from public.cv_account_branding where account_id=a;
   if v is null then raise exception 'Branding baseline missing'; end if;
   if p_logo is not null and not exists(select 1 from public.cv_logo_assets where id=p_logo and account_id=a and state='ready') then raise exception 'Logo must belong to this account and be ready'; end if;
   insert into public.cv_branding_requests(account_id,base_version_id,company_name,professional_details,logo_asset_id,explanation,requested_by)
   values(a,v,btrim(p_name),coalesce(p_details,''),p_logo,coalesce(p_explanation,''),auth.uid()) returning id into r;
   if cardinality(public.cv_branding_changed_fields(r))=0 then raise exception 'No branding changes proposed'; end if;
   insert into public.cv_audit_events(account_id,actor_id,action,subject_id) values(a,auth.uid(),'branding.requested',r);
   return r;
 end $$;
create function public.cv_apply_branding_version(p_request uuid,p_approver uuid,p_actor uuid) returns uuid
 language plpgsql security definer set search_path='' as $$
 declare r public.cv_branding_requests; v uuid;
 begin
   select * into r from public.cv_branding_requests where id=p_request;
   if not found or r.base_version_id<>(select current_version_id from public.cv_account_branding where account_id=r.account_id) then raise exception 'Branding changed; request a fresh review'; end if;
   if r.logo_asset_id is not null and not exists(select 1 from public.cv_logo_assets where id=r.logo_asset_id and account_id=r.account_id and state='ready') then raise exception 'Approved logo unavailable'; end if;
   insert into public.cv_branding_versions(account_id,company_name,professional_details,logo_asset_id,created_by,approved_by,origin)
   values(r.account_id,r.company_name,r.professional_details,r.logo_asset_id,p_actor,p_approver,'approved') returning id into v;
   update public.cv_account_branding set current_version_id=v where account_id=r.account_id;
   update public.cv_branding_requests set status='approved' where id=r.id;
   insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details)
   values(r.account_id,p_actor,'branding.changed',v,jsonb_build_object('request_id',r.id,'previous_version_id',r.base_version_id,'new_version_id',v,'approved_by',p_approver,'fields',public.cv_branding_changed_fields(r.id)));
   return v;
 end $$;
create function public.cv_review_branding(p_request uuid,p_action text,p_reason text default null,p_user uuid default null,
 p_fields text[] default null,p_expires timestamptz default null) returns boolean language plpgsql security definer set search_path='' as $$
 declare r public.cv_branding_requests; f text[]; a uuid;
 begin
   if not public.cv_is_platform_admin() then raise exception 'Platform administrator with MFA required' using errcode='42501'; end if;
   select account_id into a from public.cv_branding_requests where id=p_request;
   perform 1 from public.accounts where id=a for update;
   select * into r from public.cv_branding_requests where id=p_request for update;
   if not found or r.status not in ('pending','needs_information') then raise exception 'Request is not pending'; end if;
   if r.requested_by=auth.uid() then raise exception 'An independent administrator must review this request'; end if;
   if length(p_reason)>2000 then raise exception 'Review reason too long'; end if;
   if p_action in ('reject','information') and nullif(btrim(p_reason),'') is null then raise exception 'A review reason is required'; end if;
   f:=public.cv_branding_changed_fields(r.id);
   if p_action='approve' then
     perform public.cv_apply_branding_version(r.id,auth.uid(),r.requested_by);
   elsif p_action='grant' then
     if p_user is null or not exists(select 1 from public.account_members where account_id=a and user_id=p_user and status='active') then raise exception 'Permission recipient must be an active member'; end if;
     if p_fields is null or cardinality(p_fields)=0 or not p_fields <@ array['company_name','professional_details','logo']::text[] or not f <@ p_fields then raise exception 'Permission scope must cover exactly the proposed fields'; end if;
     if not p_fields <@ f then raise exception 'Permission cannot grant unrelated fields'; end if;
     if p_expires is null or p_expires<=clock_timestamp() or p_expires>clock_timestamp()+interval '7 days' then raise exception 'Permission must expire within seven days'; end if;
     insert into public.cv_branding_permissions(account_id,request_id,user_id,fields,expires_at,granted_by) values(a,r.id,p_user,p_fields,p_expires,auth.uid());
     update public.cv_branding_requests set status='permission_granted' where id=r.id;
   elsif p_action='reject' then update public.cv_branding_requests set status='rejected' where id=r.id;
   elsif p_action='information' then update public.cv_branding_requests set status='needs_information' where id=r.id;
   else raise exception 'Unsupported review action'; end if;
   update public.cv_branding_requests set reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),decision_reason=p_reason where id=r.id;
   insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details) values(a,auth.uid(),'branding.'||p_action,r.id,jsonb_build_object('reason',p_reason,'fields',p_fields,'expires_at',p_expires,'user_id',p_user));
   insert into public.cv_platform_audit_events(actor_id,action,account_id,subject_id) values(auth.uid(),'branding.'||p_action,a,r.id);
   return true;
 end $$;
create function public.cv_apply_branding_permission(p_permission uuid) returns boolean language plpgsql security definer set search_path='' as $$
 declare p public.cv_branding_permissions; a uuid:=public.cv_selected_account(); r public.cv_branding_requests;
 begin
   if a is null then raise exception 'Account access denied' using errcode='42501'; end if;
   perform 1 from public.accounts where id=a for update;
   if public.cv_account_role(a) is null then raise exception 'Membership removed'; end if;
   select * into p from public.cv_branding_permissions where id=p_permission and account_id=a for update;
   if not found or p.user_id<>auth.uid() or p.used_at is not null or p.revoked_at is not null or p.expires_at<=clock_timestamp() then raise exception 'Permission is unavailable or expired' using errcode='42501'; end if;
   select * into r from public.cv_branding_requests where id=p.request_id for update;
   if r.status<>'permission_granted' or not public.cv_branding_changed_fields(r.id) <@ p.fields then raise exception 'Permission scope does not match'; end if;
   perform public.cv_apply_branding_version(r.id,p.granted_by,auth.uid());
   update public.cv_branding_permissions set used_at=clock_timestamp() where id=p.id;
   insert into public.cv_audit_events(account_id,actor_id,action,subject_id) values(a,auth.uid(),'branding.permission_used',p.id);
   return true;
 end $$;
create function public.cv_branding_information(p_request uuid,p_message text) returns boolean language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_require_admin();
 begin
   if nullif(btrim(p_message),'') is null or length(p_message)>2000 then raise exception 'Provide a concise explanation'; end if;
   update public.cv_branding_requests set status='pending' where id=p_request and account_id=a and status='needs_information';
   if not found then raise exception 'Request does not need information'; end if;
   insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details) values(a,auth.uid(),'branding.information_supplied',p_request,jsonb_build_object('message',p_message));
   return true;
 end $$;
create function public.cv_revoke_branding_permission(p_permission uuid) returns boolean language plpgsql security definer set search_path='' as $$
 declare a uuid; p public.cv_branding_permissions;
 begin
   if not public.cv_is_platform_admin() then raise exception 'Platform administrator with MFA required' using errcode='42501'; end if;
   select account_id into a from public.cv_branding_permissions where id=p_permission;
   perform 1 from public.accounts where id=a for update;
   select * into p from public.cv_branding_permissions where id=p_permission for update;
   if not found or p.used_at is not null then raise exception 'Permission is not revocable'; end if;
   if p.revoked_at is not null then return true; end if;
   update public.cv_branding_permissions set revoked_at=clock_timestamp(),revoked_by=auth.uid() where id=p.id;
   update public.cv_branding_requests set status='pending' where id=p.request_id;
   insert into public.cv_audit_events(account_id,actor_id,action,subject_id) values(a,auth.uid(),'branding.permission_revoked',p.id);
   insert into public.cv_platform_audit_events(actor_id,action,account_id,subject_id) values(auth.uid(),'branding.permission_revoked',a,p.id);
   return true;
 end $$;

create function public.cv_platform_branding_queue() returns jsonb language plpgsql security definer set search_path='' as $$
 declare result jsonb;
 begin
   if not public.cv_is_platform_admin() then raise exception 'Platform administrator with MFA required' using errcode='42501'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('request',to_jsonb(r),'current',to_jsonb(v),'fields',public.cv_branding_changed_fields(r.id),
     'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at),'[]'::jsonb) from public.cv_branding_versions h where h.account_id=r.account_id),
     'audit',(select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at),'[]'::jsonb) from public.cv_audit_events e where e.account_id=r.account_id and e.action like 'branding.%'),
     'permissions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.cv_branding_permissions p where p.request_id=r.id)) order by r.created_at),'[]'::jsonb)
   into result from public.cv_branding_requests r join public.cv_account_branding b on b.account_id=r.account_id
   join public.cv_branding_versions v on v.id=b.current_version_id;
   insert into public.cv_platform_audit_events(actor_id,action) values(auth.uid(),'branding.queue_viewed');
   return result;
 end $$;
create function public.cv_permission_proposal(p_permission uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('company_name',r.company_name,'professional_details',r.professional_details,'logo_asset_id',r.logo_asset_id)
 from public.cv_branding_permissions p join public.cv_branding_requests r on r.id=p.request_id
 where p.id=p_permission and p.account_id=public.cv_selected_account() and p.user_id=auth.uid()
 and p.revoked_at is null and p.used_at is null and p.expires_at>clock_timestamp() and r.status='permission_granted' $$;
create function public.cv_logo_immutable() returns trigger language plpgsql set search_path='' as $$
 begin if old.state='ready' then raise exception 'Uploaded logo evidence is immutable'; end if; return case when tg_op='DELETE' then old else new end; end $$;
create trigger cv_logo_immutable before update or delete on public.cv_logo_assets for each row execute function public.cv_logo_immutable();

-- Certificate identity is an immutable association, avoiding updates to historical/revoked certificate rows.
create function public.cv_capture_issuer_branding() returns trigger language plpgsql security definer set search_path='' as $$
 declare v uuid;
 begin
   perform 1 from public.accounts where id=new.account_id for share;
   select current_version_id into v from public.cv_account_branding where account_id=new.account_id;
   if v is null then raise exception 'Issuer branding is not initialized'; end if;
   insert into public.cv_certificate_branding(certificate_id,account_id,branding_version_id,provenance) values(new.id,new.account_id,v,'issuance');
   return new;
 end $$;
create trigger cv_capture_issuer_branding after insert on public.certificates for each row execute function public.cv_capture_issuer_branding();
create function public.cv_certificate_issuer(p_certificate uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(v) from public.cv_certificate_branding c join public.cv_branding_versions v on v.id=c.branding_version_id
 where c.certificate_id=p_certificate and public.cv_can_use_certificate(p_certificate) $$;

alter function public.cv_public_certificate(text) rename to cv_public_certificate_stage2;
revoke execute on function public.cv_public_certificate_stage2(text) from public,anon,authenticated;
create function public.cv_public_certificate(p_reference text) returns jsonb language plpgsql stable security definer set search_path='' as $$
 declare result jsonb; v public.cv_branding_versions;
 begin
   result:=public.cv_public_certificate_stage2(p_reference);
   if result is null then return null; end if;
   select b.* into v from public.certificates c join public.cv_certificate_branding cb on cb.certificate_id=c.id
   join public.cv_branding_versions b on b.id=cb.branding_version_id where c.public_verification_id=(result->>'public_verification_id')::uuid;
   return result||jsonb_build_object('issuer_name',v.company_name,'issuer_details',v.professional_details,
     'logo_available',v.logo_asset_id is not null,'branding_reconciled',v.id is not null);
 end $$;
create function public.cv_public_logo_path(p_reference text) returns text language plpgsql stable security definer set search_path='' as $$
 declare result jsonb; p text;
 begin
   result:=public.cv_public_certificate(p_reference);
   if result is null then return null; end if;
   select l.storage_path into p from public.certificates c join public.cv_certificate_branding cb on cb.certificate_id=c.id
   join public.cv_branding_versions b on b.id=cb.branding_version_id join public.cv_logo_assets l on l.id=b.logo_asset_id and l.state='ready'
   where c.public_verification_id=(result->>'public_verification_id')::uuid;
   return p;
 end $$;
create function public.cv_logo_access(p_asset uuid) returns text language sql stable security definer set search_path='' as $$
 select l.storage_path from public.cv_logo_assets l where l.id=p_asset and l.state='ready' and
 (public.cv_is_platform_admin() or (l.account_id=public.cv_selected_account() and
 (public.cv_account_role(l.account_id) in ('owner','admin') or exists(select 1 from public.cv_branding_versions v where v.logo_asset_id=l.id)
 or exists(select 1 from public.cv_branding_requests r join public.cv_branding_permissions p on p.request_id=r.id
 where r.logo_asset_id=l.id and p.user_id=auth.uid() and p.revoked_at is null and p.used_at is null and p.expires_at>clock_timestamp() and r.status='permission_granted')))) $$;
create function public.cv_storage_logo_read(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cv_logo_assets l where l.storage_path=p_path and public.cv_logo_access(l.id) is not null) $$;

-- Real Supabase Storage schema is inspected separately; never make this bucket public.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('certverify-branding','certverify-branding',false,2097152,array['image/webp']) on conflict(id) do nothing;
do $$ begin if not exists(select 1 from storage.buckets where id='certverify-branding' and public=false
 and file_size_limit=2097152 and allowed_mime_types=array['image/webp']::text[]) then raise exception 'Existing branding bucket needs a separate security review'; end if; end $$;
create policy cv_branding_storage_read on storage.objects for select to authenticated
using(bucket_id='certverify-branding' and public.cv_storage_logo_read(name));
create policy cv_branding_storage_scope on storage.objects as restrictive for select to authenticated
using(bucket_id<>'certverify-branding' or public.cv_storage_logo_read(name));
create policy cv_branding_storage_no_anon on storage.objects as restrictive for all to anon using(bucket_id<>'certverify-branding') with check(bucket_id<>'certverify-branding');
create policy cv_branding_storage_no_insert on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'certverify-branding');
create policy cv_branding_storage_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'certverify-branding') with check(bucket_id<>'certverify-branding');
create policy cv_branding_storage_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'certverify-branding');

-- Tables are read-scoped; all state transitions use the checked RPCs.
do $$ declare t text;
 begin foreach t in array array['cv_logo_assets','cv_branding_versions','cv_account_branding','cv_branding_requests','cv_branding_permissions','cv_certificate_branding'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy cv_branding_tenant_read on public.%I for select to authenticated using(account_id=public.cv_selected_account())',t);
 end loop; end $$;
-- Pending proposals/permissions are confidential within the account too.
create policy cv_requests_admin_scope on public.cv_branding_requests as restrictive for select to authenticated using(public.cv_account_role(account_id) in ('owner','admin'));
create policy cv_permissions_user_scope on public.cv_branding_permissions as restrictive for select to authenticated using(user_id=auth.uid() or public.cv_account_role(account_id) in ('owner','admin'));
create policy cv_assets_ready_scope on public.cv_logo_assets as restrictive for select to authenticated using(public.cv_logo_access(id) is not null);
-- Explicit function grants; internal mutators never inherit PUBLIC execute access.
do $$ declare f record;
 begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('cv_validate_certificate_branding','cv_platform_branding_queue','cv_permission_proposal','cv_logo_immutable','cv_platform_identity','cv_is_platform_admin','cv_immutable_branding','cv_initialize_branding','cv_protect_account_name','cv_current_branding','cv_branding_changed_fields','cv_reserve_logo','cv_finalize_logo','cv_request_branding','cv_apply_branding_version','cv_review_branding','cv_apply_branding_permission','cv_branding_information','cv_revoke_branding_permission','cv_capture_issuer_branding','cv_certificate_issuer','cv_public_certificate','cv_public_logo_path','cv_logo_access','cv_storage_logo_read') loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 if f.proname in ('cv_platform_branding_queue','cv_permission_proposal','cv_platform_identity','cv_is_platform_admin','cv_current_branding','cv_reserve_logo','cv_request_branding','cv_review_branding','cv_apply_branding_permission','cv_branding_information','cv_revoke_branding_permission','cv_certificate_issuer','cv_public_certificate','cv_logo_access','cv_storage_logo_read') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 if f.proname in ('cv_public_certificate','cv_public_logo_path') then execute format('grant execute on function %s to anon',f.signature); end if;
 if f.proname='cv_finalize_logo' then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
 end $$;
commit;
