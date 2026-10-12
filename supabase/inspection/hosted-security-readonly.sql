-- READ ONLY. Save raw definitions privately: they can contain sensitive literals.
begin transaction read only;
select current_setting('transaction_read_only') as readonly_transaction,version() as database_version;
select p.oid::regprocedure::text as signature,pg_get_userbyid(p.proowner) as owner,
 p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute,
 case when p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE') then
  case when p.proname in ('cv_public_certificate','cv_public_logo_path','cv_pricing_catalog') then 'review public projection body and signature' else 'potential anonymous definer exposure' end
 else 'review authorization and callers' end as review_required,
 pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' order by signature;
select c.oid::regclass::text as relation,pg_get_userbyid(c.relowner) as owner,
 c.relrowsecurity,c.relforcerowsecurity,c.relacl,
 has_table_privilege('anon',c.oid,'SELECT') as anon_select,
 has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_insert,
 has_table_privilege('service_role',c.oid,'SELECT') as service_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m') order by relation;
select * from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select c.oid::regclass::text as relation,a.attname,r.rolname as grantee,x.privilege_type
from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(a.attacl) x left join pg_roles r on r.oid=x.grantee
where n.nspname='public' and a.attnum>0 and not a.attisdropped order by relation,a.attname;
select pg_get_userbyid(defaclrole) as creator,coalesce(n.nspname,'all schemas') as schema,
 defaclobjtype,defaclacl from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace;
select c.oid::regclass::text as relation,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('public','auth') order by relation,t.tgname;
select r.rolname,has_schema_privilege(r.rolname,'public','CREATE') as can_create_public,
 r.rolsuper,r.rolbypassrls from pg_roles r where r.rolname in ('anon','authenticated','service_role','postgres','supabase_auth_admin','supabase_storage_admin');
rollback;
