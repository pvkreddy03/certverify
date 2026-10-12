-- UNAPPLIED PROPOSAL. Review live schema and provision historical entitlements before rollout.
begin;
create function public.cv_billing_now() returns timestamptz language sql volatile set search_path='' as $$ select clock_timestamp() $$;
create table public.cv_plans(id uuid primary key default gen_random_uuid(),status text not null default 'draft' check(status in ('draft','active','inactive','archived')),revision bigint not null default 0,current_version_id uuid,created_at timestamptz not null default public.cv_billing_now());
create table public.cv_plan_versions(id uuid primary key default gen_random_uuid(),plan_id uuid not null references public.cv_plans(id),terms jsonb not null,created_by uuid not null,created_at timestamptz not null default public.cv_billing_now(),unique(plan_id,id));
alter table public.cv_plans add foreign key(id,current_version_id) references public.cv_plan_versions(plan_id,id);
create table public.cv_offers(id uuid primary key default gen_random_uuid(),code text not null unique check(code ~ '^[A-Z0-9_-]{3,40}$'),status text not null default 'draft' check(status in ('draft','active','inactive','archived')),revision bigint not null default 0,current_version_id uuid,redemption_count integer not null default 0,created_at timestamptz not null default public.cv_billing_now());
create table public.cv_offer_versions(id uuid primary key default gen_random_uuid(),offer_id uuid not null references public.cv_offers(id),terms jsonb not null,created_by uuid not null,created_at timestamptz not null default public.cv_billing_now(),unique(offer_id,id));
alter table public.cv_offers add foreign key(id,current_version_id) references public.cv_offer_versions(offer_id,id);
create table public.cv_subscriptions(account_id uuid primary key references public.accounts(id),cancel_at_period_end boolean not null default false,trial_used boolean not null default false,revision bigint not null default 0,promotion_version_id uuid references public.cv_offer_versions(id),promotion_cycles_remaining integer not null default 0);
create table public.cv_billing_periods(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.accounts(id),plan_version_id uuid not null references public.cv_plan_versions(id),plan_snapshot jsonb not null,starts_at timestamptz not null,ends_at timestamptz not null,licensed_seats integer not null check(licensed_seats between 1 and 10000),certificate_limit bigint check(certificate_limit>=0),list_amount_minor bigint not null check(list_amount_minor>=0),amount_due_minor bigint not null check(amount_due_minor>=0),currency text not null,offer_version_id uuid references public.cv_offer_versions(id),access_kind text not null check(access_kind in ('free','trial','complimentary')),payment_status text not null check(payment_status in ('no_payment_required','waived')),created_by uuid not null,created_at timestamptz not null default public.cv_billing_now(),check(ends_at>starts_at),unique(account_id,id));
create index cv_billing_period_account_window on public.cv_billing_periods(account_id,starts_at desc,ends_at);
create table public.cv_period_usage(period_id uuid primary key references public.cv_billing_periods(id),certificates_created bigint not null default 0 check(certificates_created>=0));
create table public.cv_certificate_consumptions(certificate_id uuid primary key references public.certificates(id),account_id uuid not null,period_id uuid not null,created_at timestamptz not null default public.cv_billing_now(),foreign key(account_id,period_id) references public.cv_billing_periods(account_id,id));
create table public.cv_billing_quotes(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.accounts(id),requested_by uuid not null,plan_version_id uuid not null references public.cv_plan_versions(id),offer_version_id uuid references public.cv_offer_versions(id),new_redemption boolean not null default false,intent text not null check(intent in ('start','trial','renewal','change')),seats integer not null,quote jsonb not null,base_period_id uuid references public.cv_billing_periods(id),expires_at timestamptz not null,status text not null default 'quoted' check(status in ('quoted','awaiting_payment','scheduled','applied','cancelled','needs_review')),accepted_nonce uuid,scheduled_for timestamptz,grant_kind text check(grant_kind in ('free','complimentary')),grant_reason text,accepted_by uuid,created_at timestamptz not null default public.cv_billing_now(),unique(account_id,accepted_nonce));
create table public.cv_offer_redemptions(offer_id uuid not null references public.cv_offers(id),account_id uuid not null references public.accounts(id),offer_version_id uuid not null references public.cv_offer_versions(id),quote_id uuid not null references public.cv_billing_quotes(id),redeemed_at timestamptz not null default public.cv_billing_now(),primary key(offer_id,account_id));
create table public.cv_payment_intents(id uuid primary key default gen_random_uuid(),quote_id uuid not null unique references public.cv_billing_quotes(id),account_id uuid not null references public.accounts(id),amount_minor bigint not null check(amount_minor>0),currency text not null,provider text not null default 'unconfigured' check(provider='unconfigured'),created_at timestamptz not null default public.cv_billing_now());
-- Closed ledger foundation. Stage 6 must authenticate provider signatures before any ingestion/settlement API exists.
create table public.cv_payment_events(id uuid primary key default gen_random_uuid(),intent_id uuid not null references public.cv_payment_intents(id),provider text not null,event_reference text not null,status text not null check(status in ('pending','failed','paid','refunded')),amount_minor bigint not null check(amount_minor>=0),currency text not null,occurred_at timestamptz not null default public.cv_billing_now(),unique(provider,event_reference));
create table public.cv_billing_audit(id uuid primary key default gen_random_uuid(),account_id uuid references public.accounts(id),actor_id uuid not null,action text not null,subject_id uuid,details jsonb not null default '{}',occurred_at timestamptz not null default public.cv_billing_now());
create index cv_billing_audit_account_time on public.cv_billing_audit(account_id,occurred_at desc);
-- No migration seeds example prices, entitlements or subscriptions.

create function public.cv_validate_plan(t jsonb) returns boolean language plpgsql immutable set search_path='' as $$
 begin
 if exists(select 1 from unnest(array['name','description','billing_period','audience','currency']) k where jsonb_typeof(t->k) is distinct from 'string')
 or exists(select 1 from unnest(array['price_minor','renewal_price_minor','extra_seat_price_minor','included_seats','currency_exponent','trial_days','custom_days']) k where jsonb_typeof(t->k) is distinct from 'number')
 or exists(select 1 from jsonb_array_elements(t->'features') f where jsonb_typeof(f)<>'string' or length(f#>>'{}')>200)
 then return false;end if;
 if jsonb_typeof(t) is distinct from 'object' or length(btrim(t->>'name')) not between 2 and 120 or length(coalesce(t->>'description',''))>2000
 or t->>'billing_period' not in ('monthly','annual','custom') or t->>'audience' not in ('standard','enterprise')
 or jsonb_typeof(t->'eligibility') is distinct from 'array' or jsonb_array_length(t->'eligibility') not between 1 and 2
 or not (t->'eligibility' <@ '["individual","organization"]'::jsonb)
 or (t->>'price_minor')::bigint not between 0 and 10000000000 or (t->>'renewal_price_minor')::bigint not between 0 and 10000000000
 or (t->>'extra_seat_price_minor')::bigint not between 0 and 10000000000 or (t->>'included_seats')::integer not between 1 and 10000
 or (t->>'currency') !~ '^[A-Z]{3}$' or (t->>'currency_exponent')::integer not between 0 and 3
 or (t->>'trial_days')::integer not between 0 and 365 or (t->>'custom_days')::integer not between 1 and 3660
 or ((t->>'max_seats') is not null and ((t->>'max_seats')::integer<(t->>'included_seats')::integer or (t->>'max_seats')::integer>10000))
 or ((t->>'certificate_limit') is not null and (t->>'certificate_limit')::bigint not between 0 and 1000000000)
 or jsonb_typeof(t->'visible') is distinct from 'boolean' or jsonb_typeof(t->'features') is distinct from 'array' or jsonb_array_length(t->'features')>50
 or (t->>'starts_at' is not null and t->>'ends_at' is not null and (t->>'ends_at')::timestamptz<=(t->>'starts_at')::timestamptz)
 then return false;end if;
 if exists(select 1 from unnest(array['starts_at','ends_at']) k where t->>k is not null and (t->>k) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$') then return false;end if;
 return t ?& array['name','description','billing_period','audience','eligibility','price_minor','renewal_price_minor','extra_seat_price_minor','included_seats','currency','currency_exponent','trial_days','custom_days','max_seats','certificate_limit','visible','features','starts_at','ends_at'];
 exception when others then return false;
 end $$;
alter table public.cv_plan_versions add check(public.cv_validate_plan(terms));
create function public.cv_validate_offer(t jsonb) returns boolean language plpgsql immutable set search_path='' as $$
 begin
 if exists(select 1 from unnest(array['name','kind','audience']) k where jsonb_typeof(t->k) is distinct from 'string')
 or exists(select 1 from unnest(array['value','cycles','trial_days','currency_exponent']) k where jsonb_typeof(t->k) is distinct from 'number')
 or (t->>'kind'='free_trial' and (t->>'cycles')::integer<>1) then return false;end if;
 if jsonb_typeof(t) is distinct from 'object' or length(btrim(t->>'name')) not between 2 and 120 or t->>'kind' not in ('percentage','fixed','intro_price','free_trial')
 or t->>'audience' not in ('new','existing','selected','all') or (t->>'value')::bigint not between 0 and 10000000000
 or (t->>'currency_exponent')::integer not between 0 and 3 or (t->>'cycles')::integer not between 1 and 36 or (t->>'trial_days')::integer not between 0 and 365
 or (t->>'kind'='percentage' and (t->>'value')::bigint>10000)
 or (t->>'kind'='free_trial' and (t->>'trial_days')::integer<1)
 or (t->>'kind' in ('fixed','intro_price') and (jsonb_typeof(t->'currency') is distinct from 'string' or (t->>'currency') !~ '^[A-Z]{3}$'))
 or ((t->>'max_redemptions') is not null and (t->>'max_redemptions')::integer not between 1 and 1000000000)
 or jsonb_typeof(t->'plan_ids') is distinct from 'array' or jsonb_typeof(t->'account_ids') is distinct from 'array'
 or jsonb_array_length(t->'plan_ids')>100 or jsonb_array_length(t->'account_ids')>100
 or (t->>'audience'='selected' and jsonb_array_length(t->'account_ids')=0)
 or (t->>'starts_at' is not null and t->>'ends_at' is not null and (t->>'ends_at')::timestamptz<=(t->>'starts_at')::timestamptz)
 then return false;end if;
 if exists(select 1 from unnest(array['starts_at','ends_at']) k where t->>k is not null and (t->>k) !~ '(Z|[+-][0-9]{2}:[0-9]{2})$') then return false;end if;
 return t ?& array['name','kind','audience','value','cycles','trial_days','currency_exponent','currency','max_redemptions','plan_ids','account_ids','starts_at','ends_at'];
 exception when others then return false;
 end $$;
alter table public.cv_offer_versions add check(public.cv_validate_offer(terms));
create function public.cv_billing_event(p_account uuid,p_actor uuid,p_action text,p_subject uuid,p_details jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
 begin
 insert into public.cv_billing_audit(account_id,actor_id,action,subject_id,details) values(p_account,p_actor,p_action,p_subject,p_details);
 if p_account is not null then insert into public.cv_audit_events(account_id,actor_id,action,subject_id,details) values(p_account,p_actor,p_action,p_subject,p_details);end if;
 if public.cv_is_platform_admin() then insert into public.cv_platform_audit_events(actor_id,action,account_id,subject_id,details) values(p_actor,p_action,p_account,p_subject,p_details);end if;
 end $$;
create function public.cv_save_plan(p_terms jsonb,p_id uuid default null,p_revision bigint default 0) returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); i uuid:=p_id;v uuid;h public.cv_plans;
 begin
 if not public.cv_validate_plan(p_terms) then raise exception 'Invalid plan terms';end if;
 if i is null then insert into public.cv_plans default values returning id into i;
 else select * into h from public.cv_plans where id=i for update;if not found or h.revision<>p_revision or h.status='archived' then raise exception 'Plan changed or archived';end if;end if;
 insert into public.cv_plan_versions(plan_id,terms,created_by) values(i,p_terms,actor) returning id into v;
 update public.cv_plans set current_version_id=v,revision=revision+1 where id=i;
 perform public.cv_billing_event(null,actor,'billing.plan_saved',i,jsonb_build_object('version_id',v));return i;
 end $$;
create function public.cv_save_offer(p_code text,p_terms jsonb,p_id uuid default null,p_revision bigint default 0) returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin();i uuid:=p_id;v uuid;h public.cv_offers;x text;
 begin
 if not public.cv_validate_offer(p_terms) then raise exception 'Invalid offer terms';end if;
 for x in select jsonb_array_elements_text(p_terms->'plan_ids') loop if not exists(select 1 from public.cv_plans where id=x::uuid) then raise exception 'Invalid offer plan';end if;end loop;
 for x in select jsonb_array_elements_text(p_terms->'account_ids') loop if not exists(select 1 from public.accounts where id=x::uuid) then raise exception 'Invalid offer account';end if;end loop;
 if i is null then insert into public.cv_offers(code) values(upper(btrim(p_code))) returning id into i;
 else select * into h from public.cv_offers where id=i for update;if not found or h.revision<>p_revision or h.status='archived' or h.code<>upper(btrim(p_code)) then raise exception 'Offer changed, archived or code immutable';end if;end if;
 insert into public.cv_offer_versions(offer_id,terms,created_by) values(i,p_terms,actor) returning id into v;
 update public.cv_offers set current_version_id=v,revision=revision+1 where id=i;
 perform public.cv_billing_event(null,actor,'billing.offer_saved',i,jsonb_build_object('version_id',v));return i;
 end $$;
create function public.cv_set_catalog_status(p_kind text,p_id uuid,p_status text,p_revision bigint) returns boolean language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin();h record;
 begin
 if p_kind not in ('plan','offer') or p_status not in ('draft','active','inactive','archived') then raise exception 'Invalid catalog status';end if;
 if p_kind='plan' then select * into h from public.cv_plans where id=p_id for update;else select * into h from public.cv_offers where id=p_id for update;end if;
 if not found or h.revision<>p_revision or h.current_version_id is null or h.status='archived' then raise exception 'Catalog item changed or archived';end if;
 if p_kind='plan' then update public.cv_plans set status=p_status,revision=revision+1 where id=p_id;else update public.cv_offers set status=p_status,revision=revision+1 where id=p_id;end if;
 perform public.cv_billing_event(null,actor,'billing.'||p_kind||'_status',p_id,jsonb_build_object('status',p_status));return true;
 end $$;
create function public.cv_pricing_catalog() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'version_id',v.id,'terms',v.terms) order by p.created_at),'[]'::jsonb)
 from public.cv_plans p join public.cv_plan_versions v on v.id=p.current_version_id where p.status='active' and (v.terms->>'visible')::boolean
 and (v.terms->>'starts_at' is null or (v.terms->>'starts_at')::timestamptz<=public.cv_billing_now())
 and (v.terms->>'ends_at' is null or (v.terms->>'ends_at')::timestamptz>public.cv_billing_now()) $$;
create function public.cv_billing_account() returns uuid language plpgsql stable security definer set search_path='' as $$
 declare a text:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-certverify-account';
 begin
 if a is null or a !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose an account' using errcode='42501';end if;
 if not exists(select 1 from public.account_members where account_id=a::uuid and user_id=auth.uid() and status='active') then raise exception 'Account membership required' using errcode='42501';end if;return a::uuid;
 end $$;
create function public.cv_billing_owner() returns uuid language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_account();
 begin
 perform 1 from public.accounts where id=a for update;
 if not public.cv_account_enabled(a) or public.cv_account_role(a) is distinct from 'owner' or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Active account owner required' using errcode='42501';end if;
 insert into public.cv_subscriptions(account_id) values(a) on conflict do nothing;return a;
 end $$;
create function public.cv_active_period(p_account uuid) returns public.cv_billing_periods language sql stable security definer set search_path='' as $$
 select p from public.cv_billing_periods p where p.account_id=p_account and p.starts_at<=public.cv_billing_now() and p.ends_at>public.cv_billing_now() order by p.starts_at desc limit 1 $$;
create function public.cv_allocated_seats(p_account uuid,p_exclude_email text default null) returns integer language sql stable security definer set search_path='' as $$
 select ((select count(*) from public.account_members where account_id=p_account and status='active')+
 (select count(*) from public.account_invitations i where i.account_id=p_account and i.status='pending' and i.expires_at>public.cv_billing_now()
 and (p_exclude_email is null or lower(i.invited_email)<>lower(p_exclude_email))
 and not exists(select 1 from public.account_members m join auth.users u on u.id=m.user_id where m.account_id=p_account and m.status='active' and lower(u.email)=lower(i.invited_email))))::integer $$;
create function public.cv_period_end(p_start timestamptz,p_terms jsonb) returns timestamptz language sql immutable set search_path='' as $$
 select case p_terms->>'billing_period' when 'monthly' then ((p_start at time zone 'UTC')+interval '1 month') at time zone 'UTC'
 when 'annual' then ((p_start at time zone 'UTC')+interval '1 year') at time zone 'UTC'
 else p_start+make_interval(days=>(p_terms->>'custom_days')::integer) end $$;
create function public.cv_offer_eligible(p_offer uuid,p_account uuid,p_plan uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
 declare o public.cv_offers;t jsonb;existing boolean;
 begin
 select * into o from public.cv_offers where current_version_id=p_offer;
 if not found or o.status<>'active' then return false;end if;select terms into t from public.cv_offer_versions where id=p_offer;
 if (t->>'starts_at' is not null and (t->>'starts_at')::timestamptz>public.cv_billing_now()) or (t->>'ends_at' is not null and (t->>'ends_at')::timestamptz<=public.cv_billing_now())
 or (t->>'max_redemptions' is not null and o.redemption_count>=(t->>'max_redemptions')::integer)
 or exists(select 1 from public.cv_offer_redemptions where offer_id=o.id and account_id=p_account)
 or (jsonb_array_length(t->'plan_ids')>0 and not (t->'plan_ids' ? p_plan::text)) then return false;end if;
 existing:=exists(select 1 from public.cv_billing_periods where account_id=p_account);
 return case t->>'audience' when 'new' then not existing when 'existing' then existing when 'selected' then t->'account_ids' ? p_account::text else true end;
 end $$;
create function public.cv_create_billing_quote(p_account uuid,p_plan uuid,p_seats integer,p_coupon text,p_intent text,p_actor uuid,p_admin boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
 declare t jsonb;v uuid;h public.cv_plans;period public.cv_billing_periods;sub public.cv_subscriptions;o uuid;ot jsonb;fresh boolean:=false;price bigint;amount bigint;trial integer:=0;q uuid;
 begin
 if p_intent is null or p_intent not in ('start','trial','renewal','change') then raise exception 'Invalid subscription intent';end if;
 insert into public.cv_subscriptions(account_id) values(p_account) on conflict do nothing;
 select * into sub from public.cv_subscriptions where account_id=p_account;select * into period from public.cv_billing_periods where account_id=p_account order by starts_at desc limit 1;
 select * into h from public.cv_plans where id=p_plan for share;
 if not found then raise exception 'Plan not found';end if;
 if p_intent='renewal' and (period.id is null or not exists(select 1 from public.cv_plan_versions where id=period.plan_version_id and plan_id=p_plan)) then raise exception 'Renewal requires an existing subscription to this plan';end if;
 if p_intent='change' and period.id is null then raise exception 'No existing subscription to change';end if;
 if p_intent='trial' and period.id is not null then raise exception 'Standard plan trials are for first enrollment';end if;
 if p_intent='start' and period.id is not null and exists(select 1 from public.cv_plan_versions where id=period.plan_version_id and plan_id=p_plan) then p_intent:='renewal';end if;

 if p_intent='renewal' and period.id is not null and exists(select 1 from public.cv_plan_versions where id=period.plan_version_id and plan_id=p_plan) then v:=period.plan_version_id;t:=period.plan_snapshot;
 else
 v:=h.current_version_id;select terms into t from public.cv_plan_versions where id=v;
 if h.status<>'active' or (not p_admin and (not (t->>'visible')::boolean or t->>'audience'='enterprise'))
 or (t->>'starts_at' is not null and (t->>'starts_at')::timestamptz>public.cv_billing_now()) or (t->>'ends_at' is not null and (t->>'ends_at')::timestamptz<=public.cv_billing_now()) then raise exception 'Plan unavailable';end if;
 if not (t->'eligibility' ? (select account_type from public.accounts where id=p_account)) then raise exception 'Plan not eligible for this account';end if;
 end if;
 if p_seats is null or p_seats<(t->>'included_seats')::integer or p_seats>coalesce((t->>'max_seats')::integer,10000) or p_seats<public.cv_allocated_seats(p_account) then raise exception 'Insufficient or invalid licensed seats';end if;
 price:=case when p_intent='renewal' or exists(select 1 from public.cv_billing_periods b join public.cv_plan_versions v on v.id=b.plan_version_id where b.account_id=p_account and v.plan_id=p_plan) then (t->>'renewal_price_minor')::bigint else (t->>'price_minor')::bigint end+(p_seats-(t->>'included_seats')::integer)*(t->>'extra_seat_price_minor')::bigint;amount:=price;
 if nullif(btrim(p_coupon),'') is not null then
 select current_version_id into o from public.cv_offers where code=upper(btrim(p_coupon)) for update;
 if o is null or not public.cv_offer_eligible(o,p_account,p_plan) then raise exception 'Offer unavailable or ineligible';end if;fresh:=true;
 elsif p_intent='renewal' and sub.promotion_cycles_remaining>0 then o:=sub.promotion_version_id;end if;
 if o is not null then
 select terms into ot from public.cv_offer_versions where id=o;
 if ot->>'kind' in ('fixed','intro_price') and (ot->>'currency'<>t->>'currency' or ot->>'currency_exponent'<>t->>'currency_exponent') then raise exception 'Offer currency mismatch';end if;
 amount:=case ot->>'kind' when 'percentage' then price-floor(price::numeric*(ot->>'value')::numeric/10000)::bigint when 'fixed' then greatest(0,price-(ot->>'value')::bigint) when 'intro_price' then least(price,(ot->>'value')::bigint) else 0 end;
 if ot->>'kind'='free_trial' then trial:=(ot->>'trial_days')::integer;end if;
 end if;
 if p_intent='trial' then trial:=(t->>'trial_days')::integer;amount:=0;if trial=0 then raise exception 'Plan has no trial';end if;end if;
 if trial>0 and (sub.trial_used or (period.id is not null and period.ends_at>public.cv_billing_now())) then raise exception 'Trial already used or subscription still active';end if;
 insert into public.cv_billing_quotes(account_id,requested_by,plan_version_id,offer_version_id,new_redemption,intent,seats,base_period_id,expires_at,quote)
 values(p_account,p_actor,v,o,fresh,p_intent,p_seats,period.id,public.cv_billing_now()+interval '30 minutes',jsonb_build_object('plan_id',p_plan,'plan_version_id',v,'plan',t,'licensed_seats',p_seats,'regular_renewal_minor',(t->>'renewal_price_minor')::bigint+(p_seats-(t->>'included_seats')::integer)*(t->>'extra_seat_price_minor')::bigint,'discounted_cycles',case when fresh then coalesce((ot->>'cycles')::integer,0) when o is not null then sub.promotion_cycles_remaining else 0 end,'list_amount_minor',price,'amount_due_minor',amount,'currency',t->>'currency','trial_days',trial,'offer_version_id',o,'offer_terms',ot)) returning id into q;
 return q;
 end $$;
create function public.cv_public_billing_quote(p_quote jsonb) returns jsonb language sql immutable set search_path='' as $$
 select p_quote||jsonb_build_object('offer_terms',case when jsonb_typeof(p_quote->'offer_terms')='object' then (p_quote->'offer_terms')-array['account_ids','plan_ids','max_redemptions','audience'] else 'null'::jsonb end) $$;
create function public.cv_quote_subscription(p_plan uuid,p_seats integer,p_coupon text default null,p_intent text default 'start') returns jsonb language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_owner();q uuid;
 begin q:=public.cv_create_billing_quote(a,p_plan,p_seats,p_coupon,p_intent,auth.uid());return (select jsonb_build_object('id',id,'expires_at',expires_at,'quote',public.cv_public_billing_quote(quote)) from public.cv_billing_quotes where id=q);end $$;

create function public.cv_materialize_billing_quote(p_quote uuid) returns uuid language plpgsql security definer set search_path='' as $$
 declare r public.cv_billing_quotes;t jsonb;p uuid;start_time timestamptz;ending timestamptz;trial integer;sub public.cv_subscriptions;
 begin
 select * into r from public.cv_billing_quotes where id=p_quote for update;
 if r.status<>'scheduled' or r.scheduled_for>public.cv_billing_now() then return null;end if;
 if r.seats<public.cv_allocated_seats(r.account_id) then update public.cv_billing_quotes set status='needs_review' where id=r.id;perform public.cv_billing_event(r.account_id,r.accepted_by,'billing.change_needs_review',r.id);return null;end if;
 t:=r.quote->'plan';start_time:=r.scheduled_for;trial:=(r.quote->>'trial_days')::integer;
 ending:=case when trial>0 then start_time+make_interval(days=>trial) else public.cv_period_end(start_time,t) end;
 if exists(select 1 from public.cv_billing_periods where account_id=r.account_id and starts_at<ending and ends_at>start_time) then raise exception 'Overlapping billing periods forbidden';end if;
 insert into public.cv_billing_periods(account_id,plan_version_id,plan_snapshot,starts_at,ends_at,licensed_seats,certificate_limit,list_amount_minor,amount_due_minor,currency,offer_version_id,access_kind,payment_status,created_by)
 values(r.account_id,r.plan_version_id,t,start_time,ending,r.seats,(t->>'certificate_limit')::bigint,(r.quote->>'list_amount_minor')::bigint,0,r.quote->>'currency',r.offer_version_id,
 case when r.grant_kind='complimentary' then 'complimentary' when trial>0 then 'trial' else 'free' end,case when r.grant_kind='complimentary' then 'waived' else 'no_payment_required' end,r.accepted_by) returning id into p;
 insert into public.cv_period_usage(period_id) values(p);
 select * into sub from public.cv_subscriptions where account_id=r.account_id for update;
 update public.cv_subscriptions set trial_used=trial_used or trial>0,cancel_at_period_end=false,revision=revision+1,
 promotion_version_id=case when r.new_redemption then r.offer_version_id when r.intent in ('start','change','trial') then null else promotion_version_id end,
 promotion_cycles_remaining=case when r.new_redemption then greatest(0,coalesce((r.quote->'offer_terms'->>'cycles')::integer,0)-1) when r.offer_version_id is not null then greatest(0,promotion_cycles_remaining-1) when r.intent in ('start','change','trial') then 0 else promotion_cycles_remaining end where account_id=r.account_id;
 update public.cv_billing_quotes set status='applied' where id=r.id;
 perform public.cv_billing_event(r.account_id,r.accepted_by,'billing.period_started',p,jsonb_build_object('quote_id',r.id,'access_kind',r.grant_kind,'reason',r.grant_reason,'plan_version_id',r.plan_version_id));return p;
 end $$;
create function public.cv_materialize_scheduled(p_account uuid) returns void language plpgsql security definer set search_path='' as $$
 declare q uuid;
 begin for q in select id from public.cv_billing_quotes where account_id=p_account and status='scheduled' and scheduled_for<=public.cv_billing_now() order by scheduled_for loop perform public.cv_materialize_billing_quote(q);end loop;end $$;
create function public.cv_accept_billing_quote(p_quote uuid,p_nonce uuid,p_actor uuid,p_grant text default 'free',p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r public.cv_billing_quotes;existing uuid;latest uuid;o public.cv_offers;start_time timestamptz;period public.cv_billing_periods;p uuid;intent uuid;
 begin
 select * into r from public.cv_billing_quotes where id=p_quote for update;
 if not found or p_nonce is null then raise exception 'Quote unavailable';end if;
 if r.accepted_nonce is not null then if r.accepted_nonce=p_nonce then return jsonb_build_object('request_id',r.id,'status',r.status);else raise exception 'Quote already accepted';end if;end if;
 select id into existing from public.cv_billing_quotes where account_id=r.account_id and accepted_nonce=p_nonce;
 if existing is not null then raise exception 'Idempotency key already used for another quote';end if;
 if r.status<>'quoted' or r.expires_at<=public.cv_billing_now() then raise exception 'Quote expired';end if;
 if r.intent<>'renewal' and (not exists(select 1 from public.cv_plans h join public.cv_plan_versions v on v.plan_id=h.id where v.id=r.plan_version_id and h.status='active')
 or (r.quote->'plan'->>'ends_at' is not null and (r.quote->'plan'->>'ends_at')::timestamptz<=public.cv_billing_now())) then raise exception 'Plan no longer available for new enrollment';end if;

 select * into period from public.cv_billing_periods where account_id=r.account_id order by starts_at desc limit 1;
 latest:=period.id;if latest is distinct from r.base_period_id then raise exception 'Subscription changed; request a new quote';end if;
 if r.seats<public.cv_allocated_seats(r.account_id) then raise exception 'Seats changed; request a new quote';end if;
 if exists(select 1 from public.cv_billing_quotes where account_id=r.account_id and status in ('scheduled','awaiting_payment')) then raise exception 'An open subscription request already exists';end if;
 if p_grant='free' and (r.quote->>'amount_due_minor')::bigint>0 then
 update public.cv_billing_quotes set status='awaiting_payment',accepted_nonce=p_nonce,accepted_by=p_actor where id=r.id;
 insert into public.cv_payment_intents(quote_id,account_id,amount_minor,currency) values(r.id,r.account_id,(r.quote->>'amount_due_minor')::bigint,r.quote->>'currency') returning id into intent;
 perform public.cv_billing_event(r.account_id,p_actor,'billing.payment_pending',r.id,jsonb_build_object('intent_id',intent));return jsonb_build_object('request_id',r.id,'status','awaiting_payment','payment_intent_id',intent,'collection_enabled',false);
 end if;
 if p_grant not in ('free','complimentary') or (p_grant='complimentary' and nullif(btrim(p_reason),'') is null) then raise exception 'Invalid complimentary grant';end if;
 if (r.quote->>'trial_days')::integer>0 and (select trial_used from public.cv_subscriptions where account_id=r.account_id) then raise exception 'Trial already used';end if;
 if r.new_redemption then
 select * into o from public.cv_offers where current_version_id=r.offer_version_id for update;
 if not found or not public.cv_offer_eligible(r.offer_version_id,r.account_id,(r.quote->>'plan_id')::uuid) then raise exception 'Offer changed or exhausted';end if;
 insert into public.cv_offer_redemptions(offer_id,account_id,offer_version_id,quote_id) values(o.id,r.account_id,r.offer_version_id,r.id);
 update public.cv_offers set redemption_count=redemption_count+1 where id=o.id;
 end if;
 start_time:=greatest(public.cv_billing_now(),coalesce(period.ends_at,public.cv_billing_now()));
 update public.cv_billing_quotes set status='scheduled',accepted_nonce=p_nonce,accepted_by=p_actor,grant_kind=p_grant,grant_reason=p_reason,scheduled_for=start_time where id=r.id;
 perform public.cv_billing_event(r.account_id,p_actor,'billing.request_accepted',r.id,jsonb_build_object('scheduled_for',start_time,'grant_kind',p_grant,'reason',p_reason));
 p:=public.cv_materialize_billing_quote(r.id);return jsonb_build_object('request_id',r.id,'status',case when p is null then 'scheduled' else 'applied' end,'period_id',p);
 end $$;
create function public.cv_accept_subscription(p_quote uuid,p_nonce uuid) returns jsonb language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_owner();
 begin
 if not exists(select 1 from public.cv_billing_quotes where id=p_quote and account_id=a and requested_by=auth.uid()) then raise exception 'Quote belongs to another account or user' using errcode='42501';end if;
 perform public.cv_materialize_scheduled(a);return public.cv_accept_billing_quote(p_quote,p_nonce,auth.uid());
 end $$;
create function public.cv_admin_grant_subscription(p_account uuid,p_plan uuid,p_seats integer,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin();q uuid;
 begin
 if nullif(btrim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'Complimentary grant reason required';end if;
 perform 1 from public.accounts where id=p_account for update;if not found or not public.cv_account_enabled(p_account) then raise exception 'Active account required';end if;
 perform public.cv_require_platform_admin();perform public.cv_materialize_scheduled(p_account);
 q:=public.cv_create_billing_quote(p_account,p_plan,p_seats,null,case when exists(select 1 from public.cv_billing_periods where account_id=p_account) then 'change' else 'start' end,actor,true);return public.cv_accept_billing_quote(q,gen_random_uuid(),actor,'complimentary',p_reason);
 end $$;
create function public.cv_subscription_action(p_action text,p_request uuid default null) returns boolean language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_account();
 begin
 perform 1 from public.accounts where id=a for update;
 if not exists(select 1 from public.account_members where account_id=a and user_id=auth.uid() and status='active' and role='owner') then raise exception 'Owner required' using errcode='42501';end if;
 if p_action='resume_renewal' and not public.cv_account_enabled(a) then raise exception 'Suspended account cannot resume renewal';end if;
 insert into public.cv_subscriptions(account_id) values(a) on conflict do nothing;
 if p_action='cancel_request' then
 update public.cv_billing_quotes set status='cancelled' where id=p_request and account_id=a and status in ('quoted','awaiting_payment','scheduled','needs_review');if not found then raise exception 'Request cannot be cancelled';end if;
 elsif p_action in ('cancel_renewal','resume_renewal') then
 update public.cv_subscriptions set cancel_at_period_end=(p_action='cancel_renewal'),revision=revision+1 where account_id=a;
 if p_action='cancel_renewal' then update public.cv_billing_quotes set status='cancelled' where account_id=a and status in ('scheduled','awaiting_payment');end if;
 else raise exception 'Unsupported subscription action';end if;
 perform public.cv_billing_event(a,auth.uid(),'billing.'||p_action,p_request);return true;
 end $$;

create function public.cv_require_entitlement(p_account uuid) returns public.cv_billing_periods language plpgsql security definer set search_path='' as $$
 declare p public.cv_billing_periods;
 begin
 perform 1 from public.accounts where id=p_account for update;
 if not public.cv_account_enabled(p_account) then raise exception 'Account disabled' using errcode='42501';end if;
 perform public.cv_materialize_scheduled(p_account);p:=public.cv_active_period(p_account);
 if p.id is null then raise exception 'Subscription expired or unavailable; billing access remains available' using errcode='42501';end if;return p;
 end $$;
create function public.cv_billing_mutation_guard() returns trigger language plpgsql security definer set search_path='' as $$
 declare d jsonb:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;a uuid;p public.cv_billing_periods;email text;capacity integer;active_count integer;
 begin
 if tg_table_name='accounts' then a:=(d->>'id')::uuid;
 elsif tg_table_name='certificate_fields' then select account_id into a from public.certificate_templates where id=(d->>'template_id')::uuid;
 elsif tg_table_name='certificate_field_values' then select account_id into a from public.certificates where id=(d->>'certificate_id')::uuid;
 else a:=(d->>'account_id')::uuid;end if;
 perform 1 from public.accounts where id=a for update;
 if tg_table_name='cv_account_branding' and public.cv_is_platform_admin() then return new;end if;
 if tg_table_name='account_members' then
 if tg_op='DELETE' or new.status<>'active' or (tg_op='UPDATE' and old.status='active') or exists(select 1 from public.account_members where account_id=a and user_id=new.user_id and status='active') then return case when tg_op='DELETE' then old else new end;end if;
 select count(*) into active_count from public.account_members where account_id=a and status='active';
 -- New account setup may create its first owner; it does not create a subscription.
 if active_count=0 and new.role='owner' and not exists(select 1 from public.cv_billing_periods where account_id=a) then return new;end if;
 p:=public.cv_require_entitlement(a);select u.email into email from auth.users u where u.id=new.user_id;
 capacity:=p.licensed_seats;
 select least(capacity,coalesce(min(seats),capacity)) into capacity from public.cv_billing_quotes where account_id=a and status='scheduled';
 if public.cv_allocated_seats(a,email)+1>capacity then raise exception 'User seat quota exceeded';end if;return new;
 elsif tg_table_name='account_invitations' then
 if tg_op<>'INSERT' then return case when tg_op='DELETE' then old else new end;end if;
 p:=public.cv_require_entitlement(a);capacity:=p.licensed_seats;
 select least(capacity,coalesce(min(seats),capacity)) into capacity from public.cv_billing_quotes where account_id=a and status='scheduled';
 if public.cv_allocated_seats(a)>=capacity then raise exception 'User seat quota exceeded';end if;return new;
 end if;
 p:=public.cv_require_entitlement(a);return case when tg_op='DELETE' then old else new end;
 end $$;
-- Must run before prior share-lock guards, avoiding concurrent lock upgrades.
create trigger cv_00_billing_guard before insert on public.certificates for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before insert or update or delete on public.certificate_templates for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before insert or update or delete on public.certificate_fields for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before insert or update or delete on public.certificate_field_values for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before update on public.accounts for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before insert or update or delete on public.account_members for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before insert or update or delete on public.account_invitations for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before insert or update on public.cv_logo_assets for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before insert on public.cv_branding_requests for each row execute function public.cv_billing_mutation_guard();
create trigger cv_00_billing_guard before update on public.cv_account_branding for each row execute function public.cv_billing_mutation_guard();
create function public.cv_consume_certificate() returns trigger language plpgsql security definer set search_path='' as $$
 declare p public.cv_billing_periods;
 begin p:=public.cv_require_entitlement(new.account_id);
 update public.cv_period_usage set certificates_created=certificates_created+1 where period_id=p.id and (p.certificate_limit is null or certificates_created<p.certificate_limit);
 if not found then raise exception 'Certificate generation quota exhausted';end if;
 insert into public.cv_certificate_consumptions(certificate_id,account_id,period_id) values(new.id,new.account_id,p.id);return new;
 end $$;
create trigger cv_consume_certificate after insert on public.certificates for each row execute function public.cv_consume_certificate();

create function public.cv_subscription_status() returns jsonb language plpgsql security definer set search_path='' as $$
 declare a uuid:=public.cv_billing_account();p public.cv_billing_periods;active boolean;owner boolean;sub public.cv_subscriptions;used bigint:=0;result jsonb;
 begin
 perform 1 from public.accounts where id=a for update;perform public.cv_billing_account();if public.cv_account_enabled(a) then perform public.cv_materialize_scheduled(a);end if;
 p:=public.cv_active_period(a);active:=p.id is not null;
 if not active then select * into p from public.cv_billing_periods where account_id=a order by starts_at desc limit 1;end if;
 select * into sub from public.cv_subscriptions where account_id=a;
 owner:=exists(select 1 from public.account_members where account_id=a and user_id=auth.uid() and status='active' and role='owner');
 if p.id is not null then select certificates_created into used from public.cv_period_usage where period_id=p.id;end if;
 result:=jsonb_build_object('account_id',a,'account_type',(select account_type from public.accounts where id=a),'can_cancel',owner,'can_manage',owner and public.cv_account_enabled(a) and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null),'entitled',active and public.cv_account_enabled(a),
 'status',case when p.id is null then 'unsubscribed' when not active then case when sub.cancel_at_period_end then 'cancelled' else 'expired' end when sub.cancel_at_period_end then 'non_renewing' when p.access_kind='trial' then 'trial' when p.offer_version_id is not null then 'promotional' else 'active' end,
 'period',case when p.id is null then null else jsonb_build_object('id',p.id,'plan_version_id',p.plan_version_id,'plan_id',(select plan_id from public.cv_plan_versions where id=p.plan_version_id),'name',p.plan_snapshot->>'name','billing_period',p.plan_snapshot->>'billing_period','starts_at',p.starts_at,'ends_at',p.ends_at,'licensed_seats',p.licensed_seats,'certificate_limit',p.certificate_limit,'certificates_created',used,'remaining_certificates',case when p.certificate_limit is null then null else greatest(0,p.certificate_limit-used) end,'payment_status',p.payment_status) end,
 'allocated_seats',public.cv_allocated_seats(a),'cancel_at_period_end',coalesce(sub.cancel_at_period_end,false),'trial_used',coalesce(sub.trial_used,false),
 'requests',case when owner then (select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from (select id,status,intent,seats,public.cv_public_billing_quote(quote) as quote,expires_at,scheduled_for,created_at from public.cv_billing_quotes where account_id=a order by created_at desc limit 50) r) else '[]'::jsonb end,
 'history',case when owner then (select coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) from (select id,starts_at,ends_at,plan_snapshot,licensed_seats,list_amount_minor,amount_due_minor,currency,access_kind,payment_status from public.cv_billing_periods where account_id=a order by starts_at desc limit 50) h) else '[]'::jsonb end,
 'payments',case when owner then (select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from (select i.id,i.amount_minor,i.currency,i.provider,i.created_at,coalesce((select e.status from public.cv_payment_events e where e.intent_id=i.id order by e.occurred_at desc,e.id limit 1),'pending') status from public.cv_payment_intents i where i.account_id=a order by i.created_at desc limit 50) i) else '[]'::jsonb end);
 return result;
 end $$;
create function public.cv_platform_billing_catalog() returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin();r jsonb;
 begin
 select jsonb_build_object('plans',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',p.status,'revision',p.revision,'version_id',v.id,'terms',v.terms) order by p.created_at),'[]'::jsonb) from public.cv_plans p join public.cv_plan_versions v on v.id=p.current_version_id),
 'offers',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'code',o.code,'status',o.status,'revision',o.revision,'redemption_count',o.redemption_count,'version_id',v.id,'terms',v.terms) order by o.created_at),'[]'::jsonb) from public.cv_offers o join public.cv_offer_versions v on v.id=o.current_version_id)) into r;
 perform public.cv_billing_event(null,actor,'billing.catalog_viewed',null);return r;
 end $$;
-- Reporting bridge derives status from authoritative periods/time, never stale Stage 4 summary rows.
create function public.cv_billing_report_status(p_account uuid) returns text language sql stable security definer set search_path='' as $$
 select case when p.id is null or p.starts_at>public.cv_billing_now() then 'unknown' when p.ends_at<=public.cv_billing_now() then case when s.cancel_at_period_end then 'cancelled' else 'expired' end when s.cancel_at_period_end then 'non_renewing' when p.access_kind='trial' then 'trial' when p.offer_version_id is not null then 'promotional' else 'active' end
 from (select p_account id) a left join lateral(select * from public.cv_billing_periods where account_id=a.id order by starts_at desc limit 1) p on true left join public.cv_subscriptions s on s.account_id=a.id $$;
create or replace function public.cv_platform_account_rows() returns table(id uuid,name text,account_code text,account_type text,created_at timestamptz,access_status text,revision bigint,subscription_status text,subscription_source text,subscription_observed_at timestamptz,member_count bigint,certificate_count bigint,active_certificates bigint,inactive_certificates bigint,revoked_certificates bigint,last_issued_at timestamptz) language sql stable security definer set search_path='' as $$
 select a.id,coalesce(v.company_name,a.account_name),a.account_code,a.account_type,a.created_at,x.status,x.revision,
 public.cv_billing_report_status(a.id),'billing-period-ledger',public.cv_billing_now(),
 (select count(*) from public.account_members m where m.account_id=a.id and m.status='active'),(select count(*) from public.certificates c where c.account_id=a.id),
 (select count(*) from public.certificates c where c.account_id=a.id and c.status='Active'),(select count(*) from public.certificates c where c.account_id=a.id and c.status='Inactive'),
 (select count(*) from public.certificates c where c.account_id=a.id and c.status='Revoked'),(select max(created_at) from public.certificates c where c.account_id=a.id)
 from public.accounts a join public.cv_account_access x on x.account_id=a.id left join public.cv_account_branding b on b.account_id=a.id left join public.cv_branding_versions v on v.id=b.current_version_id $$;
create or replace function public.cv_platform_overview(p_days integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); result jsonb;
 begin
   if p_days is null or p_days not between 1 and 90 then raise exception 'Invalid reporting period'; end if;
   select jsonb_build_object(
     'accounts',(select count(*) from public.accounts),
     'individual_accounts',(select count(*) from public.accounts where account_type='individual'),
     'organization_accounts',(select count(*) from public.accounts where account_type='organization'),
     'users',(select count(*) from auth.users),
     'certificates',(select count(*) from public.certificates),
     'active_certificates',(select count(*) from public.certificates where status='Active'),
     'inactive_certificates',(select count(*) from public.certificates where status='Inactive'),
     'revoked_certificates',(select count(*) from public.certificates where status='Revoked'),
     'access_statuses',(select jsonb_object_agg(status,n) from (select status,count(*) n from public.cv_account_access group by status) s),
     'subscription_statuses',(select jsonb_object_agg(status,n) from (select public.cv_billing_report_status(a.id) status,count(*) n from public.accounts a group by public.cv_billing_report_status(a.id)) s),
     'issuance_daily',(select jsonb_agg(jsonb_build_object('date',d.issued_day,'count',coalesce(c.n,0)) order by d.issued_day)
       from (select generate_series((clock_timestamp() at time zone 'UTC')::date-(p_days-1),(clock_timestamp() at time zone 'UTC')::date,interval '1 day')::date as issued_day) d
       left join (select (created_at at time zone 'UTC')::date as issued_day,count(*) n from public.certificates where created_at>=((clock_timestamp() at time zone 'UTC')::date-(p_days-1))::timestamp at time zone 'UTC' group by 1) c on c.issued_day=d.issued_day),
     'generated_at',clock_timestamp()) into result;
   insert into public.cv_platform_audit_events(actor_id,action,details) values(actor,'platform.overview_viewed',jsonb_build_object('days',p_days));
   return result;
 end $$;
create or replace function public.cv_platform_account(p_account uuid,p_member_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin(); result jsonb;
 begin
   if p_member_page is null or p_member_page not between 1 and 10000 then raise exception 'Invalid membership page'; end if;
   if not exists(select 1 from public.accounts where id=p_account) then return null; end if;
   select jsonb_build_object('account',(select to_jsonb(r) from public.cv_platform_account_rows() r where r.id=p_account),
     'access',(select jsonb_build_object('status',status,'revision',revision,'reason',reason,'changed_by',changed_by,'changed_at',changed_at) from public.cv_account_access where account_id=p_account),
     'subscription',jsonb_build_object('status',public.cv_billing_report_status(p_account),'source','billing-period-ledger','observed_at',public.cv_billing_now(),'period_start',(select starts_at from public.cv_billing_periods where account_id=p_account order by starts_at desc limit 1),'period_end',(select ends_at from public.cv_billing_periods where account_id=p_account order by starts_at desc limit 1)),
     'members',(select coalesce(jsonb_agg(to_jsonb(m)),'[]'::jsonb) from (select m.id,m.user_id,u.email,m.role,m.status,m.joined_at,u.email_confirmed_at
       from public.account_members m left join auth.users u on u.id=m.user_id where m.account_id=p_account order by m.joined_at,m.id limit 50 offset (p_member_page-1)*50) m),
     'member_page',p_member_page,'total_members',(select count(*) from public.account_members where account_id=p_account),
     'activity',(select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from (select id,actor_id,action,subject_id,occurred_at from public.cv_audit_events where account_id=p_account order by occurred_at desc,id limit 50) e)) into result;
   insert into public.cv_platform_audit_events(actor_id,action,account_id) values(actor,'platform.account_viewed',p_account);
   return result;
 end $$;
create function public.cv_platform_subscription_report(p_account uuid default null,p_page integer default 1) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid:=public.cv_require_platform_admin();result jsonb;
 begin
 if p_page is null or p_page not between 1 and 10000 then raise exception 'Invalid subscription page';end if;
 with filtered as(select a.id,coalesce(v.company_name,a.account_name) name,public.cv_billing_report_status(a.id) status,
   (select count(*) from public.cv_payment_intents where account_id=a.id) payment_intents,
   (select to_jsonb(p)||jsonb_build_object('certificates_created',(select certificates_created from public.cv_period_usage where period_id=p.id)) from public.cv_billing_periods p where account_id=a.id order by starts_at desc limit 1) period,
   (select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) from (select id,status,intent,seats,quote,scheduled_for from public.cv_billing_quotes where account_id=a.id and status in ('scheduled','awaiting_payment','needs_review') order by created_at desc limit 25) q) requests
 from public.accounts a left join public.cv_account_branding b on b.account_id=a.id left join public.cv_branding_versions v on v.id=b.current_version_id where p_account is null or a.id=p_account),
 page as(select * from filtered order by id limit 25 offset(p_page-1)*25)
 select jsonb_build_object('total',(select count(*) from filtered),'page',p_page,'accounts',(select coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb) from page),
 'history',case when p_account is null then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from(select * from public.cv_billing_periods where account_id=p_account order by starts_at desc limit 50) p) end,
 'audit',case when p_account is null then '[]'::jsonb else (select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) from(select * from public.cv_billing_audit where account_id=p_account order by occurred_at desc limit 50) e) end) into result;
 perform public.cv_billing_event(p_account,actor,'billing.subscriptions_viewed',p_account);return result;
 end $$;
create function public.cv_billing_evidence_guard() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 if tg_table_name='cv_billing_quotes' then
 if tg_op='DELETE' then raise exception 'Billing quote history is immutable';end if;
 if (to_jsonb(new)-array['status','accepted_nonce','scheduled_for','grant_kind','grant_reason','accepted_by']) is distinct from (to_jsonb(old)-array['status','accepted_nonce','scheduled_for','grant_kind','grant_reason','accepted_by'])
 or (old.accepted_nonce is not null and new.accepted_nonce is distinct from old.accepted_nonce)
 or (old.accepted_by is not null and new.accepted_by is distinct from old.accepted_by)
 or (old.scheduled_for is not null and new.scheduled_for is distinct from old.scheduled_for)
 or (old.grant_kind is not null and new.grant_kind is distinct from old.grant_kind)
 or (old.grant_reason is not null and new.grant_reason is distinct from old.grant_reason) then raise exception 'Quoted financial terms are immutable';end if;
 elsif tg_table_name='cv_period_usage' then
 if tg_op='DELETE' or new.period_id is distinct from old.period_id or new.certificates_created<old.certificates_created then raise exception 'Consumed quota cannot be restored';end if;
 elsif tg_table_name='cv_subscriptions' then
 if new.account_id is distinct from old.account_id or (old.trial_used and not new.trial_used) then raise exception 'Trial history cannot be reset';end if;
 end if;return new;
 end $$;
create trigger cv_billing_quote_evidence before update or delete on public.cv_billing_quotes for each row execute function public.cv_billing_evidence_guard();
create trigger cv_usage_evidence before update or delete on public.cv_period_usage for each row execute function public.cv_billing_evidence_guard();
create trigger cv_trial_evidence before update on public.cv_subscriptions for each row execute function public.cv_billing_evidence_guard();
create function public.cv_billing_period_guard() returns trigger language plpgsql security definer set search_path='' as $$
 begin
 perform 1 from public.accounts where id=new.account_id for update;
 if exists(select 1 from public.cv_billing_periods where account_id=new.account_id and starts_at<new.ends_at and ends_at>new.starts_at) then raise exception 'Overlapping billing periods forbidden';end if;return new;
 end $$;
create trigger cv_period_no_overlap before insert on public.cv_billing_periods for each row execute function public.cv_billing_period_guard();
create function public.cv_payment_event_guard() returns trigger language plpgsql security definer set search_path='' as $$
 declare i public.cv_payment_intents;
 begin
 select * into i from public.cv_payment_intents where id=new.intent_id;
 if not found or new.currency<>i.currency or (new.status<>'refunded' and new.amount_minor<>i.amount_minor) or new.amount_minor>i.amount_minor then raise exception 'Payment event does not match its intent';end if;return new;
 end $$;
create trigger cv_payment_match_intent before insert on public.cv_payment_events for each row execute function public.cv_payment_event_guard();
-- Exact historical plan/offer/financial evidence cannot be overwritten or deleted.
do $$ declare t text;
 begin foreach t in array array['cv_plan_versions','cv_offer_versions','cv_billing_periods','cv_certificate_consumptions','cv_offer_redemptions','cv_payment_intents','cv_payment_events','cv_billing_audit'] loop
 execute format('create trigger cv_billing_immutable before update or delete on public.%I for each row execute function public.cv_immutable_audit()',t);end loop;
 foreach t in array array['cv_plans','cv_plan_versions','cv_offers','cv_offer_versions','cv_subscriptions','cv_billing_periods','cv_period_usage','cv_certificate_consumptions','cv_billing_quotes','cv_offer_redemptions','cv_payment_intents','cv_payment_events','cv_billing_audit'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);end loop;
 end $$;
do $$ declare f record;
 begin for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('cv_public_billing_quote','cv_billing_evidence_guard','cv_billing_period_guard','cv_payment_event_guard','cv_billing_now','cv_validate_plan','cv_validate_offer','cv_billing_event','cv_save_plan','cv_save_offer','cv_set_catalog_status','cv_pricing_catalog','cv_billing_account','cv_billing_owner','cv_active_period','cv_allocated_seats','cv_period_end','cv_offer_eligible','cv_create_billing_quote','cv_quote_subscription','cv_materialize_billing_quote','cv_materialize_scheduled','cv_accept_billing_quote','cv_accept_subscription','cv_admin_grant_subscription','cv_subscription_action','cv_require_entitlement','cv_billing_mutation_guard','cv_consume_certificate','cv_subscription_status','cv_platform_billing_catalog','cv_billing_report_status','cv_platform_subscription_report') loop
 execute format('revoke execute on function %s from public,anon,authenticated,service_role',f.signature);
 if f.proname in ('cv_save_plan','cv_save_offer','cv_set_catalog_status','cv_pricing_catalog','cv_quote_subscription','cv_accept_subscription','cv_admin_grant_subscription','cv_subscription_action','cv_subscription_status','cv_platform_billing_catalog','cv_platform_subscription_report') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 if f.proname='cv_pricing_catalog' then execute format('grant execute on function %s to anon',f.signature);end if;
 end loop;end $$;
commit;
