-- READ ONLY. Run before Stage 3 installation in the isolated Supabase project.
-- Complements stage1-readonly.sql; never apply the proposal as an inspection.
begin transaction read only;
select current_setting('transaction_read_only') as readonly_transaction;
select n.nspname,p.proname,p.oid::regprocedure as signature,p.prosecdef,p.proconfig,
  p.proacl,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','storage') and
  (p.proname like 'cv_%' or p.prosecdef) order by n.nspname,p.proname;
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants
where table_schema in ('public','storage') and grantee in ('anon','authenticated','service_role') order by 1,2,3,4;
select table_schema,table_name,column_name,data_type from information_schema.columns
where table_schema='storage' and table_name in ('buckets','objects') order by table_name,ordinal_position;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='certverify-branding';
select count(*) as invalid_baseline_names from public.accounts
where account_name is null or length(btrim(account_name)) not between 2 and 160;
select account_id,count(*) as historical_certificates from public.certificates group by account_id order by account_id;
select tg.tgname,n.nspname,c.relname,pg_get_triggerdef(tg.oid) as definition
from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not tg.tgisinternal and n.nspname in ('public','storage') order by n.nspname,c.relname,tg.tgname;
commit;
