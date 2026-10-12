-- READ ONLY preflight/report. Complements Stage 1 and Stage 3 inspection.
begin transaction read only;
select current_setting('transaction_read_only') as readonly_transaction;
select n.nspname,p.proname,p.oid::regprocedure as signature,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','auth','storage') and (p.proname like 'cv_%' or p.prosecdef) order by 1,2;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage') order by 1,2,3;
select table_schema,table_name,column_name,data_type from information_schema.columns
where table_schema='public' and (table_name in ('accounts','account_members','cv_account_access','cv_subscription_summaries','cv_platform_admins','cv_platform_audit_events') or table_name like '%subscription%' or table_name like '%billing%' or table_name like '%payment%') order by 1,2,ordinal_position;
select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema in ('public','auth','storage') and grantee in ('anon','authenticated','service_role') order by 1,2,3,4;
select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname in ('public','auth','storage') order by 1,2,3;
select account_type,count(*) from public.accounts group by account_type;
select status,role,count(*) from public.account_members group by status,role;
-- No customer contents, auth secrets or connection credentials are selected.
commit;
