-- ValuerSeal staging (2026-11-07); review separately before any production migration.
-- All financial fields are private to the active account's owner/admin.
-- These entries represent manual valuation job fees, not Razorpay subscriptions.
create unique index if not exists cv_certificates_account_id_id_uk on public.certificates(account_id,id);

create table if not exists public.cv_valuation_display_config (
  account_id uuid not null references public.accounts(id),
  template_id uuid not null references public.certificate_templates(id) on delete cascade,
  field_names text[] not null default array[]::text[],
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key(account_id,template_id),
  constraint cv_valuation_display_field_limit check(cardinality(field_names) between 0 and 8)
);
alter table public.cv_valuation_display_config enable row level security;
revoke all on public.cv_valuation_display_config from public,anon,authenticated;
grant select,insert,update on public.cv_valuation_display_config to authenticated;
drop policy if exists cv_valuation_display_read on public.cv_valuation_display_config;
create policy cv_valuation_display_read on public.cv_valuation_display_config for select to authenticated
 using(account_id=public.cv_selected_account() and public.cv_account_role(account_id) is not null);
drop policy if exists cv_valuation_display_insert on public.cv_valuation_display_config;
create policy cv_valuation_display_insert on public.cv_valuation_display_config for insert to authenticated
 with check(account_id=public.cv_selected_account() and public.cv_account_role(account_id) in ('owner','admin')
 and exists(select 1 from public.certificate_templates t where t.id=template_id and t.account_id=account_id));
drop policy if exists cv_valuation_display_update on public.cv_valuation_display_config;
create policy cv_valuation_display_update on public.cv_valuation_display_config for update to authenticated
 using(account_id=public.cv_selected_account() and public.cv_account_role(account_id) in ('owner','admin'))
 with check(account_id=public.cv_selected_account() and public.cv_account_role(account_id) in ('owner','admin')
 and exists(select 1 from public.certificate_templates t where t.id=template_id and t.account_id=account_id));

create table if not exists public.cv_valuation_job_payments(
 certificate_id uuid primary key references public.certificates(id) on delete restrict,
 account_id uuid not null references public.accounts(id),
 client_name text not null default '', bank_name text not null default '',
 branch_name text not null default '',fee_amount numeric(14,2),
 received_amount numeric(14,2) not null default 0,due_date date,
 notes text not null default '', updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),created_at timestamptz not null default now(),
 constraint cv_valuation_fee_positive check(fee_amount is null or fee_amount>0),
 constraint cv_valuation_received_nonnegative check(received_amount>=0 and
 (fee_amount is not null or received_amount=0) and (fee_amount is null or received_amount<=fee_amount)),
 constraint cv_valuation_text_lengths check(length(client_name)<=160 and length(bank_name)<=160
 and length(branch_name)<=160 and length(notes)<=2000),
 constraint cv_valuation_payment_pair foreign key (account_id,certificate_id)
 references public.certificates(account_id,id)
);
create index if not exists cv_valuation_payment_account_due on public.cv_valuation_job_payments(account_id,due_date);
alter table public.cv_valuation_job_payments enable row level security;
revoke all on public.cv_valuation_job_payments from public,anon,authenticated;
grant select on public.cv_valuation_job_payments to authenticated;
drop policy if exists cv_valuation_fee_manager_read on public.cv_valuation_job_payments;
create policy cv_valuation_fee_manager_read on public.cv_valuation_job_payments for select to authenticated
 using(account_id=public.cv_selected_account() and public.cv_account_role(account_id) in ('owner','admin'));

create table if not exists public.cv_valuation_payment_history (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references public.accounts(id),
 certificate_id uuid not null references public.certificates(id), previous_value jsonb,
 next_value jsonb not null, actor_id uuid not null references auth.users(id),
 occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists cv_valuation_payment_history_cert
 on public.cv_valuation_payment_history(account_id,certificate_id,occurred_at desc);
alter table public.cv_valuation_payment_history enable row level security;
revoke all on public.cv_valuation_payment_history from public,anon,authenticated;
drop trigger if exists cv_valuation_payment_audit_immutable on public.cv_valuation_payment_history;
create trigger cv_valuation_payment_audit_immutable before update or delete on public.cv_valuation_payment_history
 for each row execute function public.cv_immutable_audit();

CREATE OR REPLACE FUNCTION public.cv_save_valuation_job_payment(p_certificate uuid, p_client text, p_bank text, p_branch text, p_fee numeric, p_received numeric, p_due date, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 a uuid:=public.cv_require_admin();
 prior public.cv_valuation_job_payments;
 saved public.cv_valuation_job_payments;
 actor uuid:=auth.uid();
begin
 if p_certificate is null or not exists(
   select 1 from public.certificates c where c.id=p_certificate and c.account_id=a
 ) then raise exception 'Certificate not found in current workspace' using errcode='42501'; end if;
 if length(coalesce(p_client,''))>160 or length(coalesce(p_bank,''))>160 or
    length(coalesce(p_branch,''))>160 or length(coalesce(p_notes,''))>2000 then
      raise exception 'Payment details exceed allowed length' using errcode='22023';
 end if;
 if p_fee is not null and (p_fee<=0 or p_fee>999999999999.99) then
   raise exception 'Job fee must be a positive amount' using errcode='22023';
 end if;
 if p_received is null or p_received<0 or
   (p_fee is null and p_received<>0) or
   (p_fee is not null and p_received>p_fee) then
   raise exception 'Amount received must be between zero and the agreed fee' using errcode='22023';
 end if;
 perform 1 from public.accounts where id=a for update;
 select * into prior from public.cv_valuation_job_payments
   where account_id=a and certificate_id=p_certificate for update;
 insert into public.cv_valuation_job_payments(
   account_id,certificate_id,client_name,bank_name,branch_name,
   fee_amount,received_amount,due_date,notes,updated_by,updated_at
 ) values (
   a,p_certificate,btrim(coalesce(p_client,'')),btrim(coalesce(p_bank,'')),
   btrim(coalesce(p_branch,'')),p_fee,p_received,p_due,
   btrim(coalesce(p_notes,'')),actor,clock_timestamp()
 ) on conflict (certificate_id) do update set
   client_name=excluded.client_name, bank_name=excluded.bank_name,
   branch_name=excluded.branch_name, fee_amount=excluded.fee_amount,
   received_amount=excluded.received_amount, due_date=excluded.due_date,
   notes=excluded.notes, updated_by=excluded.updated_by, updated_at=excluded.updated_at
 returning * into saved;
 insert into public.cv_valuation_payment_history(
   account_id,certificate_id,previous_value,next_value,actor_id
 ) values (a,p_certificate,case when prior.certificate_id is null then null else to_jsonb(prior) end,
   to_jsonb(saved),actor);
 return to_jsonb(saved);
end $function$
;

revoke all on function public.cv_save_valuation_job_payment(uuid,text,text,text,numeric,numeric,date,text) from public,anon;
grant execute on function public.cv_save_valuation_job_payment(uuid,text,text,text,numeric,numeric,date,text) to authenticated;
