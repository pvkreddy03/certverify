import { before, after } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { createDatabaseHarness } from "./harness";
import type { PlanTerms, OfferTerms } from "../../lib/billing/types";
export function createBillingHarness(stage7 = false) {
  const {
    start,
    close,
    sql,
    as,
    ids,
    quote: literal,
    concurrentSql,
  } = createDatabaseHarness();
  before(async () => {
    await start();
    sql(
      readFileSync(
        "supabase/proposals/20261012_stage2_certificate_revocation.sql",
        "utf8",
      ),
    );
    sql(
      `create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;grant select,insert,update,delete on storage.objects to anon,authenticated;create policy broad_storage on storage.objects for all to anon,authenticated using(true) with check(true);`,
    );
    sql(
      readFileSync("supabase/proposals/20261012_stage3_branding.sql", "utf8"),
    );
    sql(
      readFileSync(
        "supabase/proposals/20261012_stage4_platform_admin.sql",
        "utf8",
      ),
    );
    // Model broad Supabase defaults and ensure the proposal closes them explicitly.
    sql(`alter default privileges in schema public grant execute on functions to service_role;
    alter default privileges in schema public grant select,insert,update,delete on tables to service_role;`);
    sql(readFileSync("supabase/proposals/20261012_stage5_billing.sql", "utf8"));
    sql(
      readFileSync("supabase/proposals/20261012_stage6_payments.sql", "utf8"),
    );
    if (stage7)
      sql(
        readFileSync(
          "supabase/proposals/20261012_stage7_readiness.sql",
          "utf8",
        ),
      );
    sql(
      `insert into public.cv_platform_admins(user_id) values('${ids.other}')`,
    );
  });
  after(close);
  const planTerms = (patch: Partial<PlanTerms> = {}): PlanTerms => ({
    name: "Configurable Plan",
    description: "Test terms",
    eligibility: ["individual", "organization"],
    audience: "standard",
    billing_period: "monthly",
    custom_days: 30,
    price_minor: 39900,
    renewal_price_minor: 49900,
    currency: "INR",
    currency_exponent: 2,
    included_seats: 5,
    extra_seat_price_minor: 39900,
    max_seats: 10,
    certificate_limit: 2,
    trial_days: 7,
    visible: true,
    features: ["QR verification"],
    starts_at: null,
    ends_at: null,
    ...patch,
  });
  const offerTerms = (patch: Partial<OfferTerms> = {}): OfferTerms => ({
    name: "Test campaign",
    kind: "percentage",
    audience: "all",
    value: 10000,
    cycles: 1,
    trial_days: 0,
    currency_exponent: 2,
    currency: null,
    max_redemptions: null,
    plan_ids: [],
    account_ids: [],
    starts_at: null,
    ends_at: null,
    ...patch,
  });
  const superAs = (statement: string, aal = "aal2") =>
    as(ids.other, null, statement, aal);
  function admin(statement: string) {
    return sql(superAs(statement)).out;
  }
  function value(statement: string, account = ids.a, user = ids.owner) {
    const out = sql(as(user, account, statement)).out;
    return out === "t"
      ? true
      : out === "f"
        ? false
        : out
          ? JSON.parse(out)
          : null;
  }
  function plan(terms = planTerms()) {
    const id = admin(
      `select public.cv_save_plan(${literal(JSON.stringify(terms))}::jsonb)`,
    );
    admin(`select public.cv_set_catalog_status('plan','${id}','active',1)`);
    return id;
  }
  function offer(code: string, terms = offerTerms()) {
    const id = admin(
      `select public.cv_save_offer('${code}',${literal(JSON.stringify(terms))}::jsonb)`,
    );
    admin(`select public.cv_set_catalog_status('offer','${id}','active',1)`);
    return id;
  }
  function getQuote(
    p: string,
    account = ids.a,
    intent = "start",
    coupon = "",
    seats = 5,
  ) {
    return value(
      `select public.cv_quote_subscription('${p}',${seats},${literal(coupon)},'${intent}')`,
      account,
    );
  }
  function accept(q: string, account = ids.a, nonce = randomUUID()) {
    return value(
      `select public.cv_accept_subscription('${q}','${nonce}')`,
      account,
    );
  }
  function clock(days = 0) {
    sql(
      `create or replace function public.cv_billing_now() returns timestamptz language sql volatile set search_path='' as $$ select clock_timestamp()+interval '${days} days' $$`,
    );
  }
  function account(type = "organization") {
    clock();
    const id = randomUUID();
    sql(
      `insert into public.accounts(id,account_name,account_type) values('${id}','Payment fixture','${type}');insert into public.account_members(account_id,user_id,role,status) values('${id}','${ids.owner}','owner','active')`,
    );
    return id;
  }
  function service(statement: string) {
    return `begin;set local role service_role;${statement};commit;`;
  }
  function prepared(a = account(), p = plan(), coupon = "") {
    const q = getQuote(p, a, "start", coupon);
    const i = accept(q.id, a);
    const t = value(
      `select public.cv_prepare_checkout('${i.payment_intent_id}')`,
      a,
    );
    const order = `order_${t.id.replaceAll("-", "")}`;
    sql(
      service(
        `select public.cv_bind_gateway_order('${t.id}','${order}','${t.receipt}',${t.amount_minor},'${t.currency}')`,
      ),
    );
    return { a, p, q, i, t, order, payment: `pay_${t.id.replaceAll("-", "")}` };
  }
  type Checkout = ReturnType<typeof prepared>;
  function observe(
    c: Checkout,
    patch: {
      status?: string;
      amount?: number;
      currency?: string;
      refund?: number;
      event?: string;
      payment?: string;
      disputed?: boolean;
    } = {},
  ) {
    return service(
      `select public.cv_process_gateway_payment('${c.order}','${patch.payment ?? c.payment}',${patch.amount ?? c.t.amount_minor},'${patch.currency ?? c.t.currency}','${patch.status ?? "captured"}',${patch.refund ?? 0},'${patch.event ?? randomUUID()}','${createHash(
        "sha256",
      )
        .update(
          JSON.stringify({
            payment: patch.payment ?? c.payment,
            status: patch.status ?? "captured",
            refund: patch.refund ?? 0,
            disputed: patch.disputed ?? false,
          }),
        )
        .digest("hex")}',${patch.disputed ?? false})`,
    );
  }
  function captured(c: Checkout) {
    return JSON.parse(sql(observe(c)).out);
  }

  return {
    sql,
    as,
    ids,
    literal,
    concurrentSql,
    admin,
    superAs,
    value,
    plan,
    planTerms,
    offer,
    offerTerms,
    getQuote,
    accept,
    clock,
    account,
    service,
    prepared,
    observe,
    captured,
  };
}
