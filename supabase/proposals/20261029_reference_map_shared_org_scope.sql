-- Within an owner-approved workspace, show the organization's valuation reference history.
-- cv_can_access_reference_map() remains the required privileged guard.
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
    where c.account_id=v_account and public.cv_geo_parse(v.field_value) is not null
    order by c.created_at desc,c.id
    limit p_limit
  ) g;
  return result;
end $function$
;
revoke all on function public.cv_geo_reference_points(integer) from public,anon;
grant execute on function public.cv_geo_reference_points(integer) to authenticated;