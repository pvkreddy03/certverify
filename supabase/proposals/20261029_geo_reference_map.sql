-- Staging-only geo reference and coarse, non-identifying platform analytics.
-- Coordinate snapshots live in certificate_field_values; no client/bank identity is shared with analytics.
begin;
create or replace function public.cv_geo_parse(p_text text) returns jsonb
language plpgsql immutable set search_path='' as $$
declare v jsonb;
begin
  if p_text is null or length(p_text)>1500 then return null; end if;
  v := p_text::jsonb;
  if jsonb_typeof(v) <> 'object' or jsonb_typeof(v->'lat') <> 'number' or jsonb_typeof(v->'lng') <> 'number' then return null; end if;
  if (v->>'lat')::numeric not between -90 and 90 or (v->>'lng')::numeric not between -180 and 180 then return null; end if;
  return v;
exception when others then return null;
end $$;
revoke all on function public.cv_geo_parse(text) from public,anon,authenticated;

create index if not exists cv_geo_field_value_lookup on public.certificate_field_values(certificate_id)
  where field_type='location';

create or replace function public.cv_geo_reference_points(p_limit integer default 1500)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_account uuid; result jsonb;
begin
  v_account := public.cv_selected_account();
  if v_account is null then raise exception 'Selected workspace access required' using errcode='42501'; end if;
  if p_limit is null or p_limit<1 or p_limit>1500 then raise exception 'Invalid map page size'; end if;
  select coalesce(jsonb_agg(to_jsonb(g) order by g.created_at desc),'[]'::jsonb) into result from (
    select c.id, c.certificate_id, c.template_name,
      c.created_at, c.valuation_date, c.status,
      c.price_per_sq_meter, c.total_property_value,
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
end $$;
revoke all on function public.cv_geo_reference_points(integer) from public,anon,service_role;
grant execute on function public.cv_geo_reference_points(integer) to authenticated;

create or replace function public.cv_geo_admin_summary()
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform public.cv_require_platform_admin();
  -- All outputs are coarse grid counts; suppress cells with fewer than five records.
  with raw as (
    select c.account_id,
      round(((public.cv_geo_parse(v.field_value)->>'lat')::numeric)/0.1)*0.1 as lat_grid,
      round(((public.cv_geo_parse(v.field_value)->>'lng')::numeric)/0.1)*0.1 as lng_grid
    from public.certificate_field_values v
    join public.certificates c on c.id=v.certificate_id
    where v.field_type='location' and public.cv_geo_parse(v.field_value) is not null
  ), cells as (
    select lat_grid,lng_grid,count(*) total,count(distinct account_id) account_count
    from raw group by lat_grid,lng_grid having count(*)>=5 and count(distinct account_id)>=3
  )
  select jsonb_build_object(
    'mapped_count',(select count(*) from raw),
    'covered_accounts',(select count(distinct account_id) from raw),
    'cells',coalesce((select jsonb_agg(jsonb_build_object('lat',lat_grid,'lng',lng_grid,'count',total) order by total desc) from (select * from cells order by total desc limit 200) g),'[]'::jsonb),
    'privacy','Coarse approximately 11km cells with at least 5 records from 3 different accounts; no exact records or identities'
  ) into result;
  insert into public.cv_platform_audit_events(actor_id,action,details)
    values(auth.uid(),'geo.aggregate_viewed',jsonb_build_object('scope','coarse_aggregates'));
  return result;
end $$;
revoke all on function public.cv_geo_admin_summary() from public,anon,service_role;
grant execute on function public.cv_geo_admin_summary() to authenticated;

create table if not exists public.cv_geo_search_budget(
 id boolean primary key default true check (id=true),
 next_at timestamptz not null default '-infinity'::timestamptz
);
insert into public.cv_geo_search_budget(id,next_at) values(true,'-infinity')
on conflict(id) do nothing;
revoke all on public.cv_geo_search_budget from public,anon,authenticated;
alter table public.cv_geo_search_budget enable row level security;
create or replace function public.cv_geo_reserve_search()
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare permitted boolean;
begin
  if auth.uid() is null or public.cv_selected_account() is null then return false; end if;
  update public.cv_geo_search_budget
  set next_at=clock_timestamp()+interval '1100 milliseconds'
  where id=true and next_at<=clock_timestamp() returning true into permitted;
  return coalesce(permitted,false);
end $$;
revoke all on function public.cv_geo_reserve_search() from public,anon,service_role;
grant execute on function public.cv_geo_reserve_search() to authenticated;
commit;
