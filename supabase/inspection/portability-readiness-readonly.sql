-- Run read-only against the authorized CertVerify project before any
-- migration, restore or hosting change. Returns counts only, no client data.
begin transaction read only;

select 'accounts' as metric,count(*)::bigint as value from public.accounts
union all select 'account_members',count(*) from public.account_members
union all select 'auth_users',count(*) from auth.users
union all select 'certificates',count(*) from public.certificates
union all select 'public_certificate_ids',count(*) from public.certificates where public_verification_id is not null
union all select 'certificate_branding_links',count(*) from public.cv_certificate_branding
union all select 'approved_branding_versions',count(*) from public.cv_branding_versions
union all select 'logo_assets_ready',count(*) from public.cv_logo_assets where state='ready'
union all select 'logo_storage_files',count(*) from storage.objects where bucket_id='certverify-branding'
union all select 'subscription_periods',count(*) from public.cv_billing_periods
union all select 'certificate_field_values',count(*) from public.certificate_field_values
order by metric;

select 'duplicate_public_verification_ids' as check_name,count(*)::bigint as failures
from (select public_verification_id from public.certificates where public_verification_id is not null group by public_verification_id having count(*)>1) d
union all
select 'branding_cross_account',count(*)
from public.cv_certificate_branding cb join public.certificates c on c.id=cb.certificate_id
join public.cv_branding_versions v on v.id=cb.branding_version_id
where cb.account_id<>c.account_id or v.account_id<>cb.account_id
union all
select 'current_branding_cross_account',count(*)
from public.cv_account_branding ab join public.cv_branding_versions v on v.id=ab.current_version_id
where v.account_id<>ab.account_id
union all
select 'approved_logos_missing_storage_file',count(*)
from public.cv_logo_assets l
join public.cv_branding_versions v on v.logo_asset_id=l.id
left join storage.objects o on o.bucket_id='certverify-branding' and o.name=l.storage_path
where l.state='ready' and o.id is null
union all
select 'orphan_certificate_fields',count(*)
from public.certificate_field_values f left join public.certificates c on c.id=f.certificate_id
where c.id is null
union all
select 'orphan_subscription_period_usage',count(*)
from public.cv_period_usage u left join public.cv_billing_periods p on p.id=u.period_id
where p.id is null
order by check_name;

rollback;
