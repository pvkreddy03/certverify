-- Metadata/ownership inspection only. No migration, Auth mutation or email send.
-- Function bodies can contain sensitive literals. Store output privately; do not commit.
begin read only;
set local statement_timeout = '15s';
select current_setting('transaction_read_only') as readonly_transaction;
select n.nspname as schema, p.oid::regprocedure::text as signature,
  p.prosecdef as security_definer, p.proconfig as settings,
  pg_get_userbyid(p.proowner) as owner, p.proacl::text as execute_acl,
  pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.prokind in ('f','p') and (n.nspname='public' or p.oid in (
  select t.tgfoid from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace s on s.oid=c.relnamespace
  where not t.tgisinternal and s.nspname in ('public','auth')
)) order by signature;
select n.nspname as schema,c.relname as table_name,t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('public','auth') order by schema,table_name,trigger_name;
select * from pg_policies where schemaname='public' order by tablename,policyname;
select table_schema,table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema in ('public','auth') order by table_schema,table_name,ordinal_position;
select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema='public' order by table_name,grantee,privilege_type;
select c.relname as table_name,a.attname as column_name,r.rolname as grantee,x.privilege_type
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(a.attacl) x left join pg_roles r on r.oid=x.grantee
where n.nspname='public' and a.attnum>0 and not a.attisdropped order by table_name,column_name,grantee;
select n.nspname as schema,c.relname as table_name,c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,c.relacl::text as raw_acl from pg_class c
join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by table_name;
select n.nspname as schema,c.relname as table_name,k.conname as name,pg_get_constraintdef(k.oid) as definition,k.convalidated
from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' order by table_name,name;
select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname;
select n.nspname as schema,c.relname as view_name,c.relacl::text as acl,pg_get_viewdef(c.oid,true) as definition
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m') order by view_name;
select pg_get_userbyid(defaclrole) as owner,defaclobjtype,defaclacl::text as default_acl from pg_default_acl;
-- These are ownership candidates, NOT an instruction to choose the oldest account.
select t.id as template_id,t.user_id as creator_id,
  coalesce((select jsonb_agg(distinct m.account_id) from public.account_members m
    where m.user_id=t.user_id and m.status='active'),'[]'::jsonb) as active_membership_candidates,
  coalesce((select jsonb_agg(distinct c.account_id) from public.certificates c
    where c.template_id=t.id and c.account_id is not null),'[]'::jsonb) as issued_certificate_accounts
from public.certificate_templates t order by t.id;
select certificate_id,count(*) as records from public.certificates group by certificate_id having count(*)>1;
commit;
