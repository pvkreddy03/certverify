-- Staging-only extension. No production migration is authorized.
-- A batch is an organization-owned grouping; certificates and QR references
-- remain individually issued and stored exactly as in the manual flow.
create table if not exists public.cv_bulk_batches (
 id uuid primary key default gen_random_uuid(),
 account_id uuid not null references public.accounts(id),
 created_by uuid not null references auth.users(id),
 template_id uuid not null references public.certificate_templates(id),
 batch_name text not null check (length(batch_name) between 1 and 120),
 source_name text not null check (length(source_name) between 1 and 180),
 idempotency_key uuid not null,
 row_count integer not null check (row_count between 1 and 100),
 created_at timestamptz not null default clock_timestamp(),
 unique (account_id,idempotency_key)
);
create index if not exists cv_bulk_batches_account_created
 on public.cv_bulk_batches(account_id,created_at desc);
create table if not exists public.cv_bulk_items (
 batch_id uuid not null references public.cv_bulk_batches(id) on delete restrict,
 account_id uuid not null references public.accounts(id),
 certificate_id uuid not null unique references public.certificates(id) on delete restrict,
 source_row integer not null check (source_row between 2 and 101),
 primary key(batch_id,source_row)
);
create index if not exists cv_bulk_items_certificate on public.cv_bulk_items(certificate_id);
alter table public.cv_bulk_batches enable row level security;
alter table public.cv_bulk_items enable row level security;
revoke all on public.cv_bulk_batches,public.cv_bulk_items from public,anon,authenticated,service_role;

create or replace function public.cv_bulk_batch_details(p_batch uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare a uuid:=public.cv_selected_account();role text; b public.cv_bulk_batches; items jsonb;
begin
  if a is null or not public.cv_auth_identity_active() then raise exception 'Active membership required' using errcode='42501'; end if;
  role:=public.cv_account_role(a);
  select * into b from public.cv_bulk_batches where id=p_batch and account_id=a;
  if b.id is null or (role not in ('owner','admin') and b.created_by<>auth.uid()) then
    raise exception 'Batch not accessible' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceRow',i.source_row,
    'id',c.id,
    'certificateId',c.certificate_id,
    'publicReference',c.public_verification_id,
    'status',c.status
  ) order by i.source_row),'[]'::jsonb) into items
  from public.cv_bulk_items i join public.certificates c on c.id=i.certificate_id
  where i.batch_id=b.id and i.account_id=a;
  return jsonb_build_object('id',b.id,'name',b.batch_name,'sourceName',b.source_name,
    'rowCount',b.row_count,'createdAt',b.created_at,'items',items);
end $$;

create or replace function public.cv_bulk_batches_list()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare a uuid:=public.cv_selected_account();role text;
begin
 if a is null or not public.cv_auth_identity_active() then raise exception 'Active membership required' using errcode='42501'; end if;
 role:=public.cv_account_role(a);
 return (select coalesce(jsonb_agg(jsonb_build_object(
 'id',x.id,'name',x.batch_name,'sourceName',x.source_name,
 'rowCount',x.row_count,'createdAt',x.created_at) order by x.created_at desc),'[]'::jsonb)
 from (select * from public.cv_bulk_batches b where b.account_id=a
  and (role in ('owner','admin') or b.created_by=auth.uid())
  order by created_at desc limit 100) x);
end $$;

create or replace function public.cv_create_certificate_batch(
 p_template uuid, p_rows jsonb, p_idempotency uuid, p_filename text, p_label text default ''
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 a uuid:=public.cv_selected_account();
 role text;template_name text;field_count int; row_count int;
 b public.cv_bulk_batches; row_data jsonb; f record; row_num int;
 val text; c_id uuid; ref text; key text;
begin
 if a is null or not public.cv_auth_identity_active() then raise exception 'Active membership required' using errcode='42501'; end if;
 role:=public.cv_account_role(a);
 if role is null or role not in ('owner','admin','member') then
  raise exception 'Certificate creation is not permitted' using errcode='42501';
 end if;
 if p_idempotency is null or p_template is null or p_rows is null or
    jsonb_typeof(p_rows)<>'array' then raise exception 'Invalid bulk request'; end if;
 row_count:=jsonb_array_length(p_rows);
 if row_count<1 or row_count>100 or length(p_rows::text)>250000 then
   raise exception 'A batch must contain 1 to 100 rows and no oversized cells'; end if;
 if length(trim(coalesce(p_filename,''))) not between 1 and 180 or
    length(trim(coalesce(p_label,'')))>120 then raise exception 'Invalid batch name'; end if;
 -- Lock organization first, matching the existing serial numbering and
 -- quota guard. Retries with the exact same UUID return the existing batch.
 perform 1 from public.accounts where id=a for update;
 select * into b from public.cv_bulk_batches where account_id=a and idempotency_key=p_idempotency;
 if found then
   if b.template_id<>p_template or b.row_count<>row_count or b.source_name<>trim(p_filename) then
     raise exception 'This import key has already been used with different data'; end if;
   return public.cv_bulk_batch_details(b.id);
 end if;
 if not public.cv_account_enabled(a) then raise exception 'Account not active' using errcode='42501'; end if;
 select t.name into template_name from public.certificate_templates t
  where t.id=p_template and t.account_id=a;
 if template_name is null then raise exception 'Template unavailable for this organization' using errcode='42501'; end if;
 select count(*) into field_count from public.certificate_fields where template_id=p_template;
 if field_count=0 then raise exception 'The selected template has no fields'; end if;
 -- All row validation happens before generating ANY certificate ID.
 for row_num in 0..row_count-1 loop
   row_data:=p_rows->row_num;
   if jsonb_typeof(row_data)<>'object' or
      (select count(*) from jsonb_object_keys(row_data))<>field_count then
     raise exception 'Row % must contain exactly the selected template fields',row_num+2;
   end if;
   for f in select id,field_name,field_type,is_required from public.certificate_fields
     where template_id=p_template loop
     key:=f.id::text;
     if not row_data ? key or jsonb_typeof(row_data->key) not in ('string','null') then
       raise exception 'Row % has an invalid % value',row_num+2,f.field_name; end if;
     val:=row_data->>key;
     if length(coalesce(val,''))>1500 or (f.is_required and length(trim(coalesce(val,'')))=0) then
       raise exception 'Row % has an empty or oversized % field',row_num+2,f.field_name; end if;
     if coalesce(val,'')<>'' and f.field_type='number' and
       (val !~ '^-?[0-9]+([.][0-9]+)?$' or length(val)>45) then
       raise exception 'Row % has an invalid number in %',row_num+2,f.field_name; end if;
     if coalesce(val,'')<>'' and f.field_type='date' then
       if val !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Row % needs date YYYY-MM-DD in %',row_num+2,f.field_name; end if;
       begin perform val::date; exception when others then raise exception 'Row % has an invalid date in %',row_num+2,f.field_name; end;
     end if;
   end loop;
 end loop;
 -- Existing AFTER INSERT quota trigger and branding trigger run for EACH row.
 -- If row 100 fails, PostgreSQL rolls back rows 1..99, counters and IDs.
 insert into public.cv_bulk_batches(account_id,created_by,template_id,batch_name,source_name,idempotency_key,row_count)
 values(a,auth.uid(),p_template,coalesce(nullif(trim(p_label),''),trim(p_filename)),trim(p_filename),p_idempotency,row_count)
 returning * into b;
 for row_num in 0..row_count-1 loop
   row_data:=p_rows->row_num;
   ref:=public.generate_certificate_id(a);
   insert into public.certificates(user_id,account_id,certificate_id,template_id,template_name,status)
   values(auth.uid(),a,ref,p_template,template_name,'Active')
   returning id into c_id;
   for f in select id,field_name,field_type,is_public,display_order
     from public.certificate_fields where template_id=p_template order by display_order,id loop
     insert into public.certificate_field_values(certificate_id,field_name,field_type,field_value,is_public,display_order)
     values(c_id,f.field_name,f.field_type,nullif(row_data->>f.id::text,''),f.is_public,f.display_order);
   end loop;
   insert into public.cv_bulk_items(batch_id,account_id,certificate_id,source_row)
   values(b.id,a,c_id,row_num+2);
 end loop;
 return public.cv_bulk_batch_details(b.id);
end $$;
revoke all on function public.cv_bulk_batch_details(uuid),public.cv_bulk_batches_list(),public.cv_create_certificate_batch(uuid,jsonb,uuid,text,text)
 from public,anon,service_role;
grant execute on function public.cv_bulk_batch_details(uuid),public.cv_bulk_batches_list(),public.cv_create_certificate_batch(uuid,jsonb,uuid,text,text)
 to authenticated;
