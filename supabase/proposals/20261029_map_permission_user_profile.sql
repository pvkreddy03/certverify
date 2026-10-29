
-- Customer profile and opt-in reference map permissions (staging)
alter table public.account_members add column if not exists can_access_reference_map boolean not null default false;

create or replace function public.cv_can_access_reference_map() returns boolean
language sql stable security definer set search_path=''
as $$
 select coalesce((select (m.role in ('owner','admin') or (m.role='member' and m.can_access_reference_map))
 from public.account_members m where m.account_id=public.cv_selected_account()
 and m.user_id=auth.uid() and m.status='active'),false)
 and public.cv_auth_identity_active()
$$;
revoke all on function public.cv_can_access_reference_map() from public,anon;
grant execute on function public.cv_can_access_reference_map() to authenticated;

create or replace function public.cv_set_member_map_permission(p_member_id uuid,p_allowed boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_account uuid:=public.cv_require_admin(); v_target public.account_members;
begin
 if public.cv_account_role(v_account) <> 'owner' then
  raise exception 'Only organization owner may grant Reference Map access' using errcode='42501';
 end if;
 select * into v_target from public.account_members
 where id=p_member_id and account_id=v_account and status='active' for update;
 if not found or v_target.role <> 'member' then
  raise exception 'Active sub-user not found' using errcode='42501';
 end if;
 update public.account_members set can_access_reference_map=p_allowed,updated_at=clock_timestamp()
 where id=p_member_id and account_id=v_account;
 insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details)
 values(v_account,auth.uid(),'member.reference_map_permission_updated',v_target.user_id,
 jsonb_build_object('allowed',p_allowed,'previous',v_target.can_access_reference_map));
 return true;
end $$;
revoke all on function public.cv_set_member_map_permission(uuid,boolean) from public,anon;
grant execute on function public.cv_set_member_map_permission(uuid,boolean) to authenticated;

create table if not exists public.cv_user_contact_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check (char_length(display_name)<=120),
 contact_email text check (contact_email is null or char_length(contact_email)<=254),
 mobile text check (mobile is null or char_length(mobile)<=25),
 job_title text check (job_title is null or char_length(job_title)<=120),
 city text check (city is null or char_length(city)<=120),
 bio text check (bio is null or char_length(bio)<=350),
 avatar_path text check (avatar_path is null or char_length(avatar_path)<=170),
 updated_at timestamptz not null default now()
);
alter table public.cv_user_contact_profiles enable row level security;
create policy cv_contact_self_select on public.cv_user_contact_profiles
 for select to authenticated using (user_id=auth.uid() and public.cv_auth_identity_active());
create policy cv_contact_self_insert on public.cv_user_contact_profiles
 for insert to authenticated with check (user_id=auth.uid() and public.cv_auth_identity_active()
 and (avatar_path is null or avatar_path ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}[.]webp$')));
create policy cv_contact_self_update on public.cv_user_contact_profiles
 for update to authenticated using (user_id=auth.uid() and public.cv_auth_identity_active())
 with check (user_id=auth.uid() and public.cv_auth_identity_active()
 and (avatar_path is null or avatar_path ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}[.]webp$')));
grant select,insert,update on public.cv_user_contact_profiles to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('certverify-user-avatars','certverify-user-avatars',false,1048576,array['image/webp'])
on conflict(id) do update set public=false,file_size_limit=1048576,allowed_mime_types=array['image/webp'];

-- This is RESTRICTIVE because existing legacy permissive policies allow
-- reads in buckets other than branding. New avatars must stay private.
create policy cv_avatar_private_boundary on storage.objects as restrictive for all to public
 using (bucket_id <> 'certverify-user-avatars' or (
 auth.uid() is not null and public.cv_auth_identity_active()
 and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}[.]webp$'))
 or public.cv_is_platform_admin())
 with check (bucket_id <> 'certverify-user-avatars' or (
 auth.uid() is not null and public.cv_auth_identity_active()
 and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}[.]webp$')));
create policy cv_avatar_select on storage.objects for select to authenticated
 using (bucket_id='certverify-user-avatars' and
 ((auth.uid() is not null and public.cv_auth_identity_active() and
 name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}[.]webp$')) or public.cv_is_platform_admin()));
create policy cv_avatar_insert on storage.objects for insert to authenticated
 with check (bucket_id='certverify-user-avatars' and auth.uid() is not null
 and public.cv_auth_identity_active() and
 name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}[.]webp$'));
create policy cv_avatar_delete on storage.objects for delete to authenticated
 using (bucket_id='certverify-user-avatars' and auth.uid() is not null
 and public.cv_auth_identity_active() and
 name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}[.]webp$'));

create or replace function public.cv_platform_contact_profiles(p_account uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
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
 'city',p.city,'bio',p.bio,'avatar_path',p.avatar_path,'updated_at',p.updated_at)
 order by m.joined_at),'[]'::jsonb) into result
 from public.account_members m join auth.users u on u.id=m.user_id
 left join public.cv_user_contact_profiles p on p.user_id=m.user_id
 left join public.profiles pr on pr.user_id=m.user_id where m.account_id=p_account;
 return result;
end $$;
revoke all on function public.cv_platform_contact_profiles(uuid) from public,anon;
grant execute on function public.cv_platform_contact_profiles(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.cv_geo_reference_points(p_limit integer DEFAULT 1500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_account uuid; result jsonb;
begin
  v_account := public.cv_selected_account();
  if v_account is null then raise exception 'Selected workspace access required' using errcode='42501'; end if;
  if not public.cv_can_access_reference_map() then raise exception 'Reference Map permission required' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>1500 then raise exception 'Invalid map page size'; end if;
  select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at desc),'[]'::jsonb) into result from (
    select c.id, c.certificate_id, c.template_name,
      c.created_at,
      coalesce(c.valuation_date::text,
        (select f2.field_value from public.certificate_field_values f2
          where f2.certificate_id=c.id and f2.field_type='date'
            and f2.field_name ~* '(valuation.*date|date.*valuation|inspection.*date|date.*inspection)'
            and f2.field_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          order by f2.display_order limit 1)
      ) valuation_date, c.status,
      c.price_per_sq_meter, c.total_property_value,
      (select coalesce(jsonb_agg(jsonb_build_object('name',metric.field_name,'value',metric.field_value) order by metric.display_order),'[]'::jsonb)
        from (select f2.field_name,left(f2.field_value,100) field_value,f2.display_order
          from public.certificate_field_values f2
          where f2.certificate_id=c.id
            and f2.field_type in ('number','text')
            and f2.field_name ~* '(rate|price|market value|land value|property value|valuation amount|fair value)'
            and f2.field_value is not null
          order by f2.display_order limit 8) metric
      ) valuation_metrics,
      v.field_name, (public.cv_geo_parse(v.field_value)->>'lat')::double precision lat,
      (public.cv_geo_parse(v.field_value)->>'lng')::double precision lng,
      left(coalesce(public.cv_geo_parse(v.field_value)->>'label',''),200) label
    from public.certificates c
    join public.certificate_field_values v on v.certificate_id=c.id and v.field_type='location'
    where c.account_id=v_account and c.user_id=auth.uid() and public.cv_geo_parse(v.field_value) is not null
    order by c.created_at desc,c.id
    limit p_limit
  ) g;
  return result;
end $function$
;
revoke all on function public.cv_geo_reference_points(integer) from public,anon;
grant execute on function public.cv_geo_reference_points(integer) to authenticated;