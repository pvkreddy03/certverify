-- READ ONLY: emits review candidates; executes no REVOKE or GRANT.
-- Review actual bodies, overloads, default grants and every caller before approval.
-- Not a blanket fix: legitimate public QR/logo/catalog projections remain public.
begin transaction read only;
select current_setting('transaction_read_only') as readonly_transaction;
select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as private_review_definition,
 format('revoke execute on function %s from public, anon;',p.oid::regprocedure) ||
 case when p.proname in ('is_account_admin','is_active_account_member') and has_function_privilege('authenticated',p.oid,'EXECUTE')
 then format(' grant execute on function %s to authenticated;',p.oid::regprocedure)
 else '' end as proposed_privilege_sql
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')
 and p.proname in ('is_account_admin','is_active_account_member','generate_certificate_id','generate_account_code','generate_user_code','handle_new_user','set_account_code','set_user_code','accept_account_invitation','create_account_invitation','revoke_account_invitation','upgrade_account_to_organization','revoke_certificate')
order by signature;
rollback;
