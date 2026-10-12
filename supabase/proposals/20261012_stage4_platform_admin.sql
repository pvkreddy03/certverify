-- UNAPPLIED PROPOSAL. Requires reviewed Stages 1–3 and actual live function/grant inspection.
begin;

create table public.cv_account_access (
  account_id uuid primary key references public.accounts(id),
  status text not null default 'active' check(status in ('active','inactive','suspended')),
  revision bigint not null default 0 check(revision>=0),
  changed_by uuid,changed_at timestamptz not null default clock_timestamp(),reason text
);
insert into public.cv_account_access(account_id) select id from public.accounts;
create table public.cv_subscription_summaries (
  account_id uuid primary key references public.accounts(id),
  status text not null check(status in ('unknown','trial','active','expired','cancelled','non_renewing','promotional','past_due','paused')),
  source text not null check(length(btrim(source)) between 1 and 120),
  observed_at timestamptz not null default clock_timestamp(),
  period_start timestamptz,period_end timestamptz,
  check(period_start is null or period_end is null or period_end>period_start)
);
-- Informational summaries only. No seeded subscriptions, plans, prices, entitlements or payment APIs.
alter table public.cv_account_access enable row level security;
alter table public.cv_subscription_summaries enable row level security;
revoke all on public.cv_account_access,public.cv_subscription_summaries from public,anon,authenticated;
create index cv_platform_audit_account_time on public.cv_platform_audit_events(account_id,occurred_at desc,id);
create index cv_account_audit_time on public.cv_audit_events(account_id,occurred_at desc,id);
create index if not exists cv_certificate_account_status_time on public.certificates(account_id,status,created_at);

create function public.cv_initialize_account_access() returns trigger language plpgsql security definer set search_path='' as $$
 begin insert into public.cv_account_access(account_id) values(new.id); return new; end $$;
create trigger cv_initialize_account_access after insert on public.accounts for each row execute function public.cv_initialize_account_access();
create function public.cv_account_enabled(p_account uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cv_account_access where account_id=p_account and status='active') $$;
create or replace function public.cv_account_role(p_account_id uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from public.account_members m where m.account_id=p_account_id and m.user_id=auth.uid()
 and m.status='active' and public.cv_account_enabled(p_account_id) $$;
-- Keep account metadata discoverable for active memberships in disabled accounts, allowing safe switching.
create function public.cv_customer_account_states() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('account_id',s.account_id,'status',s.status)),'[]'::jsonb)
 from public.cv_account_access s join public.account_members m on m.account_id=s.account_id
 where m.user_id=auth.uid() and m.status='active' $$;

create function public.cv_account_mutation_guard() returns trigger language plpgsql security definer set search_path='' as $$
 declare a uuid; row_data jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 begin
   if tg_table_name='accounts' then a:=(row_data->>'id')::uuid;
   elsif tg_table_name='certificate_fields' then select account_id into a from public.certificate_templates where id=(row_data->>'template_id')::uuid;
   elsif tg_table_name='certificate_field_values' then select account_id into a from public.certificates where id=(row_data->>'certificate_id')::uuid;
   else a:=(row_data->>'account_id')::uuid; end if;
   perform 1 from public.accounts where id=a for share;
   if not public.cv_account_enabled(a) then raise exception 'Account access is disabled' using errcode='42501'; end if;
   if tg_argv[0]='membership' and auth.uid() is not null and public.cv_account_role(a) is null then
     raise exception 'Active account membership required' using errcode='42501';
   end if;
   return case when tg_op='DELETE' then old else new end;
 end $$;
-- Share locks recheck state after waits and serialize mutations with suspension/member removal.
create trigger cv_access_guard before insert or update or delete on public.certificates for each row execute function public.cv_account_mutation_guard('membership');
create trigger cv_access_guard before insert or update or delete on public.certificate_templates for each row execute function public.cv_account_mutation_guard('membership');
create trigger cv_access_guard before insert or update or delete on public.certificate_fields for each row execute function public.cv_account_mutation_guard('membership');
create trigger cv_access_guard before insert or update or delete on public.certificate_field_values for each row execute function public.cv_account_mutation_guard('membership');
create trigger cv_access_guard before update or delete on public.accounts for each row execute function public.cv_account_mutation_guard('membership');
-- Invitation recipients are not members yet; existing recipient-bound RPC checks remain authoritative.
create trigger cv_access_guard before insert or update or delete on public.account_members for each row execute function public.cv_account_mutation_guard('enabled');
create trigger cv_access_guard before insert or update or delete on public.account_invitations for each row execute function public.cv_account_mutation_guard('enabled');
create trigger cv_access_guard before insert or update or delete on public.cv_logo_assets for each row execute function public.cv_account_mutation_guard('enabled');
create function public.cv_immutable_audit() returns trigger language plpgsql set search_path='' as $$
 begin raise exception 'Administrative evidence is immutable'; end $$;
create trigger cv_audit_immutable before update or delete on public.cv_audit_events for each row execute function public.cv_immutable_audit();

create function public.cv_require_platform_admin() returns uuid language plpgsql security definer set search_path='' as $$
 begin
   if not public.cv_is_platform_admin() then raise exception 'Verified platform administrator with MFA required' using errcode='42501'; end if;
   return auth.uid();
 end $$;
create function public.cv_platform_overview(p_days integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); result jsonb;
 begin
   if p_days is null or p_days not between 1 and 90 then raise exception 'Invalid reporting period'; end if;
   select jsonb_build_object(
     'accounts',(select count(*) from public.accounts),
     'individual_accounts',(select count(*) from public.accounts where account_type='individual'),
     'organization_accounts',(select count(*) from public.accounts where account_type='organization'),
     'users',(select count(*) from auth.users),
     'certificates',(select count(*) from public.certificates),
     'active_certificates',(select count(*) from public.certificates where status='Active'),
     'inactive_certificates',(select count(*) from public.certificates where status='Inactive'),
     'revoked_certificates',(select count(*) from public.certificates where status='Revoked'),
     'access_statuses',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.cv_account_access group by status) s),
     'subscription_statuses',(select jsonb_object_agg(status,n) from (select coalesce(s.status,'unknown') status,count(*) n from public.accounts a left join public.cv_subscription_summaries s on s.account_id=a.id group by coalesce(s.status,'unknown')) s),
     'issuance_daily',(select jsonb_agg(jsonb_build_object('date',d.issued_day,'count',coalesce(c.n,0)) order by d.issued_day)
       from (select generate_series((clock_timestamp() at time zone 'UTC')::date-(p_days-1),(clock_timestamp() at time zone 'UTC')::date,interval '1 day')::date as issued_day) d
       left join (select (created_at at time zone 'UTC')::date as issued_day,count(*) n from public.certificates where created_at>=((clock_timestamp() at time zone 'UTC')::date-(p_days-1))::timestamp at time zone 'UTC' group by 1) c on c.issued_day=d.issued_day),
     'generated_at',clock_timestamp()) into result;
   insert into public.cv_platform_audit_events(actor_id,action,details) values(actor,'platform.overview_viewed',jsonb_build_object('days',p_days));
   return result;
 end $$;
-- Internal metadata projection: no certificate fields, private reasons, auth secrets or raw profile metadata.
create function public.cv_platform_account_rows() returns table(
 id uuid,name text,account_code text,account_type text,created_at timestamptz,access_status text,revision bigint,
 subscription_status text,subscription_source text,subscription_observed_at timestamptz,
 member_count bigint,certificate_count bigint,active_certificates bigint,inactive_certificates bigint,revoked_certificates bigint,last_issued_at timestamptz)
 language sql stable security definer set search_path='' as $$
 select a.id,coalesce(v.company_name,a.account_name),a.account_code,a.account_type,a.created_at,x.status,x.revision,
 coalesce(s.status,'unknown'),s.source,s.observed_at,
 (select count(*) from public.account_members m where m.account_id=a.id and m.status='active'),
 (select count(*) from public.certificates c where c.account_id=a.id),
 (select count(*) from public.certificates c where c.account_id=a.id and c.status='Active'),
 (select count(*) from public.certificates c where c.account_id=a.id and c.status='Inactive'),
 (select count(*) from public.certificates c where c.account_id=a.id and c.status='Revoked'),
 (select max(created_at) from public.certificates c where c.account_id=a.id)
 from public.accounts a join public.cv_account_access x on x.account_id=a.id
 left join public.cv_account_branding b on b.account_id=a.id left join public.cv_branding_versions v on v.id=b.current_version_id
 left join public.cv_subscription_summaries s on s.account_id=a.id $$;
create function public.cv_platform_accounts(p_search text default '',p_type text default null,p_status text default null,
 p_subscription text default null,p_page integer default 1,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); result jsonb;
 begin
   if p_search is null or length(p_search)>200 or p_page is null or p_page not between 1 and 10000 or p_limit is null or p_limit not between 1 and 50
   or (p_type is not null and p_type not in ('individual','organization')) or (p_status is not null and p_status not in ('active','inactive','suspended'))
   or (p_subscription is not null and p_subscription not in ('unknown','trial','active','expired','cancelled','non_renewing','promotional','past_due','paused')) then raise exception 'Invalid account filters'; end if;
   with filtered as (select r.* from public.cv_platform_account_rows() r
     where (p_type is null or r.account_type=p_type) and (p_status is null or r.access_status=p_status)
     and (p_subscription is null or r.subscription_status=p_subscription)
     and (p_search='' or position(lower(p_search) in lower(r.name))>0 or position(lower(p_search) in lower(coalesce(r.account_code,'')))>0
       or position(lower(p_search) in r.id::text)>0 or exists(select 1 from public.account_members m join auth.users u on u.id=m.user_id
         where m.account_id=r.id and m.role='owner' and m.status='active' and position(lower(p_search) in lower(u.email))>0))),
   page as (select * from filtered order by created_at desc,id limit p_limit offset (p_page-1)*p_limit)
   select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,'limit',p_limit,
     'accounts',(select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id),'[]'::jsonb) from page)) into result;
   insert into public.cv_platform_audit_events(actor_id,action,details) values(actor,'platform.accounts_viewed',jsonb_build_object('searched',p_search<>'','page',p_page,'type',p_type,'status',p_status,'subscription',p_subscription));
   return result;
 end $$;
create function public.cv_platform_account(p_account uuid,p_member_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); result jsonb;
 begin
   if p_member_page is null or p_member_page not between 1 and 10000 then raise exception 'Invalid membership page'; end if;
   if not exists(select 1 from public.accounts where id=p_account) then return null; end if;
   select jsonb_build_object('account',(select to_jsonb(r) from public.cv_platform_account_rows() r where r.id=p_account),
     'access',(select jsonb_build_object('status',status,'revision',revision,'reason',reason,'changed_by',changed_by,'changed_at',changed_at) from public.cv_account_access where account_id=p_account),
     'subscription',(select jsonb_build_object('status',status,'source',source,'observed_at',observed_at,'period_start',period_start,'period_end',period_end) from public.cv_subscription_summaries where account_id=p_account),
     'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from (select m.id,m.user_id,u.email,m.role,m.status,m.joined_at,u.email_confirmed_at
       from public.account_members m left join auth.users u on u.id=m.user_id where m.account_id=p_account order by m.joined_at,m.id limit 50 offset (p_member_page-1)*50) m),
     'member_page',p_member_page,'total_members',(select count(*) from public.account_members where account_id=p_account),
     'activity',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from (select id,actor_id,action,subject_id,occurred_at from public.cv_audit_events where account_id=p_account order by occurred_at desc,id limit 50) e)) into result;
   insert into public.cv_platform_audit_events(actor_id,action,account_id) values(actor,'platform.account_viewed',p_account);
   return result;
 end $$;
create function public.cv_platform_set_account_access(p_account uuid,p_status text,p_reason text,p_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); state public.cv_account_access; why text:=nullif(btrim(p_reason),'');
 begin
   if p_status is null or p_status not in ('active','inactive','suspended') or why is null or length(why)>2000 or p_revision is null then raise exception 'Valid status, reason and revision required'; end if;
   perform 1 from public.accounts where id=p_account for update;
   if not found then raise exception 'Account not found'; end if;
   perform public.cv_require_platform_admin();
   select * into state from public.cv_account_access where account_id=p_account for update;
   if state.revision<>p_revision then raise exception 'Account changed; refresh before acting' using errcode='40001'; end if;
   if state.status=p_status then return jsonb_build_object('status',state.status,'revision',state.revision); end if;
   update public.cv_account_access set status=p_status,revision=revision+1,changed_by=actor,changed_at=clock_timestamp(),reason=why where account_id=p_account;
   insert into public.cv_platform_audit_events(actor_id,action,account_id,subject_id,details) values(actor,'account.access_changed',p_account,p_account,
     jsonb_build_object('previous_status',state.status,'status',p_status,'reason',why,'revision',state.revision+1));
   insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details) values(p_account,actor,'account.access_changed',p_account,
     jsonb_build_object('previous_status',state.status,'status',p_status,'reason',why,'revision',state.revision+1));
   return jsonb_build_object('status',p_status,'revision',state.revision+1);
 end $$;
create function public.cv_platform_audit(p_account uuid default null,p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); result jsonb;
 begin
   if p_page is null or p_page not between 1 and 10000 then raise exception 'Invalid audit page'; end if;
   with filtered as (select * from public.cv_platform_audit_events where p_account is null or account_id=p_account),
     page as (select * from filtered order by occurred_at desc,id limit 50 offset (p_page-1)*50)
   select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,'events',(select coalesce(jsonb_agg(to_jsonb(page) order by occurred_at desc,id),'[]'::jsonb) from page)) into result;
   insert into public.cv_platform_audit_events(actor_id,action,account_id,details) values(actor,'platform.audit_viewed',p_account,jsonb_build_object('page',p_page));
   return result;
 end $$;

create function public.cv_platform_branding_requests(p_status text default 'open',p_page integer default 1,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); result jsonb;
 begin
   if p_page is null or p_page not between 1 and 10000 or p_limit is null or p_limit not between 1 and 50
     or (p_status is not null and p_status not in ('open','pending','needs_information','permission_granted','approved','rejected','cancelled')) then raise exception 'Invalid branding report filters'; end if;
   with filtered as (select * from public.cv_branding_requests where p_status is null or status=p_status or (p_status='open' and status in ('pending','needs_information','permission_granted'))),
     page as (select * from filtered order by created_at desc,id limit p_limit offset (p_page-1)*p_limit)
   select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,'limit',p_limit,
     'reviews',(select coalesce(jsonb_agg(jsonb_build_object('request',to_jsonb(r),'current',to_jsonb(v),'fields',public.cv_branding_changed_fields(r.id),
       'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at),'[]'::jsonb) from public.cv_branding_versions h where h.account_id=r.account_id),
       'audit',(select coalesce(jsonb_agg(to_jsonb(e) order by e.occurred_at),'[]'::jsonb) from public.cv_audit_events e where e.account_id=r.account_id and e.action like 'branding.%'),
       'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'email',u.email,'role',m.role)),'[]'::jsonb) from public.account_members m join auth.users u on u.id=m.user_id where m.account_id=r.account_id and m.status='active'),
       'permissions',(select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.cv_branding_permissions p where p.request_id=r.id)) order by r.created_at desc,r.id),'[]'::jsonb)
     from page r join public.cv_account_branding b on b.account_id=r.account_id join public.cv_branding_versions v on v.id=b.current_version_id)) into result;
   insert into public.cv_platform_audit_events(actor_id,action,details) values(actor,'branding.queue_viewed',jsonb_build_object('status',p_status,'page',p_page));
   return result;
 end $$;
-- The replacement queue is bounded; existing branding actions/permissions remain unchanged.
revoke execute on function public.cv_platform_branding_queue() from authenticated;

-- No raw cross-tenant grants, privileged self-assignment endpoints, or new client write privileges.
do $$ declare f record;
 begin for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('cv_initialize_account_access','cv_account_enabled','cv_customer_account_states','cv_account_mutation_guard','cv_immutable_audit','cv_require_platform_admin','cv_platform_overview','cv_platform_account_rows','cv_platform_accounts','cv_platform_account','cv_platform_set_account_access','cv_platform_audit','cv_platform_branding_requests') loop
 execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 if f.proname in ('cv_customer_account_states','cv_platform_overview','cv_platform_accounts','cv_platform_account','cv_platform_set_account_access','cv_platform_audit','cv_platform_branding_requests') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop; end $$;
commit;
