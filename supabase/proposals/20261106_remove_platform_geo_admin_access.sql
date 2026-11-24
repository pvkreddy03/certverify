-- ValuerSeal privacy: admin accounts must not access users' property locations or profile city.
-- Safe for the isolated testing database. Preserve account-level reference maps.
BEGIN;
DROP FUNCTION IF EXISTS public.cv_geo_admin_summary();
CREATE OR REPLACE FUNCTION public.cv_platform_contact_profiles(p_account uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not public.cv_is_platform_admin() then
  raise exception 'Platform administrator MFA required' using errcode='42501';
 end if;
 if not exists(select 1 from public.accounts a where a.id=p_account) then
  raise exception 'Account not found' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'user_id',m.user_id,'role',m.role,'status',m.status,'login_email',u.email,
 'display_name',coalesce(nullif(p.display_name,''),pr.professional_name,''),
 'contact_email',p.contact_email,'mobile',p.mobile,'job_title',p.job_title,
 'bio',p.bio,'avatar_path',p.avatar_path,'updated_at',p.updated_at)
 order by m.joined_at),'[]'::jsonb) into result
 from public.account_members m join auth.users u on u.id=m.user_id
 left join public.cv_user_contact_profiles p on p.user_id=m.user_id
 left join public.profiles pr on pr.user_id=m.user_id where m.account_id=p_account;
 return result;
end $function$
;
COMMIT;
