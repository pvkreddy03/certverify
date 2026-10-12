import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createDatabaseHarness } from "./harness";
import type { PlanTerms, OfferTerms } from "../../lib/billing/types";
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
  sql(readFileSync("supabase/proposals/20261012_stage3_branding.sql", "utf8"));
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
  sql(readFileSync("supabase/proposals/20261012_stage6_payments.sql", "utf8"));
  sql(`insert into public.cv_platform_admins(user_id) values('${ids.other}')`);
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
    `select public.cv_process_gateway_payment('${c.order}','${patch.payment ?? c.payment}',${patch.amount ?? c.t.amount_minor},'${patch.currency ?? c.t.currency}','${patch.status ?? "captured"}',${patch.refund ?? 0},'${patch.event ?? randomUUID()}','${"a".repeat(64)}',${patch.disputed ?? false})`,
  );
}
function captured(c: Checkout) {
  return JSON.parse(sql(observe(c)).out);
}
test("a verified capture activates exactly the immutable priced period; authorized payments do not", () => {
  const c = prepared(
    account("individual"),
    plan(planTerms({ included_seats: 1, certificate_limit: 20 })),
  );
  sql(observe(c, { status: "authorized" }));
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
  captured(c);
  const state = value("select public.cv_subscription_status()", c.a);
  assert.equal(state.entitled, true);
  assert.equal(state.period.payment_status, "captured");
  assert.equal(state.history[0].amount_due_minor, c.t.amount_minor);
});
test("owners cannot settle unpaid intents; members, other tenants and unconfirmed users cannot checkout", () => {
  const c = prepared();
  assert.notEqual(
    sql(
      as(
        ids.owner,
        c.a,
        `select public.cv_process_gateway_payment('${c.order}','${c.payment}',39900,'INR','captured',0,'forged','${"a".repeat(64)}')`,
      ),
      false,
    ).status,
    0,
  );
  for (const [user, a] of [
    [ids.member, c.a],
    [ids.owner, ids.b],
    [ids.unconfirmed, c.a],
  ])
    assert.notEqual(
      sql(
        as(
          user,
          a,
          `select public.cv_prepare_checkout('${c.i.payment_intent_id}')`,
        ),
        false,
      ).status,
      0,
    );
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
});
test("order binding rejects incorrect receipts, amounts, currencies and reassignment", () => {
  const c = prepared();
  for (const [receipt, amount, currency] of [
    ["wrong", c.t.amount_minor, "INR"],
    [c.t.receipt, 1, "INR"],
    [c.t.receipt, c.t.amount_minor, "USD"],
  ])
    assert.notEqual(
      sql(
        service(
          `select public.cv_bind_gateway_order('${c.t.id}','order_other','${receipt}',${amount},'${currency}')`,
        ),
        false,
      ).status,
      0,
    );
  assert.notEqual(
    sql(
      service(
        `select public.cv_bind_gateway_order('${c.t.id}','order_other','${c.t.receipt}',${c.t.amount_minor},'INR')`,
      ),
      false,
    ).status,
    0,
  );
});
test("incorrect captured amount or currency cannot activate access", () => {
  const c = prepared();
  assert.notEqual(sql(observe(c, { amount: 1 }), false).status, 0);
  assert.notEqual(sql(observe(c, { currency: "USD" }), false).status, 0);
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
});
test("duplicate events and concurrent capture confirmations create one period and one payment ledger entry", async () => {
  const c = prepared();
  const results = await Promise.all([
    concurrentSql(observe(c)),
    concurrentSql(observe(c)),
  ]);
  assert.equal(results.filter((r) => r.status === 0).length, 2);
  assert.equal(
    sql(
      `select count(*) from public.cv_billing_periods where account_id='${c.a}'`,
    ).out,
    "1",
  );
  assert.equal(
    sql(
      `select count(*) from public.cv_payment_events where intent_id='${c.i.payment_intent_id}'`,
    ).out,
    "1",
  );
  const event = randomUUID();
  sql(observe(c, { event }));
  assert.equal(JSON.parse(sql(observe(c, { event })).out).duplicate, true);
  const another = prepared();
  assert.notEqual(sql(observe(another, { event }), false).status, 0);
});
test("failure and out-of-order authorization do not downgrade verified captured access", () => {
  const c = prepared();
  sql(observe(c, { status: "failed" }));
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
  captured(c);
  sql(observe(c, { status: "failed" }));
  sql(observe(c, { status: "authorized" }));
  assert.equal(
    value(`select public.cv_payment_attempt('${c.t.id}')`, c.a).state,
    "captured",
  );
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    true,
  );
});
test("late captures are durably recorded for review without entitlement", () => {
  const c = prepared();
  clock(1);
  captured(c);
  assert.equal(
    value(`select public.cv_payment_attempt('${c.t.id}')`, c.a).state,
    "review",
  );
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
  clock();
});
test("suspended and cancelled checkout captures do not activate access", () => {
  const c = prepared();
  sql(
    `update public.cv_account_access set status='suspended' where account_id='${c.a}'`,
  );
  captured(c);
  assert.equal(
    value(`select public.cv_payment_attempt('${c.t.id}')`, c.a).state,
    "review",
  );
  const d = prepared();
  value(
    `select public.cv_subscription_action('cancel_request','${d.q.id}')`,
    d.a,
  );
  captured(d);
  assert.equal(
    value("select public.cv_subscription_status()", d.a).entitled,
    false,
  );
});
test("coupon capacity is reserved before order creation across accounts and free redemptions", async () => {
  const campaign = offer(
    `PAY${Date.now()}`,
    offerTerms({ value: 5000, max_redemptions: 1 }),
  );
  const code = sql(
    `select code from public.cv_offers where id='${campaign}'`,
  ).out;
  const p = plan();
  const a = account(),
    b = account();
  const qa = getQuote(p, a, "start", code),
    qb = getQuote(p, b, "start", code);
  const ia = accept(qa.id, a),
    ib = accept(qb.id, b);
  const results = await Promise.all([
    concurrentSql(
      as(
        ids.owner,
        a,
        `select public.cv_prepare_checkout('${ia.payment_intent_id}')`,
      ),
    ),
    concurrentSql(
      as(
        ids.owner,
        b,
        `select public.cv_prepare_checkout('${ib.payment_intent_id}')`,
      ),
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 0).length, 1);
  assert.equal(
    sql(
      `select count(*) from public.cv_payment_offer_reservations where offer_id='${campaign}'`,
    ).out,
    "1",
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account(),
        `select public.cv_quote_subscription('${p}',5,'${code}','start')`,
      ),
      false,
    ).status,
    0,
  );
});
test("reserved coupons settle once and history remains immutable after catalog changes", () => {
  const code = `CAP${Date.now()}`;
  offer(code, offerTerms({ value: 5000, max_redemptions: 1 }));
  const c = prepared(account(), plan(), code);
  admin(`select public.cv_set_catalog_status('plan','${c.p}','archived',2)`);
  captured(c);
  captured(c);
  assert.equal(
    sql(
      `select count(*) from public.cv_offer_redemptions where account_id='${c.a}'`,
    ).out,
    "1",
  );
  assert.equal(
    value("select public.cv_subscription_status()", c.a).history[0]
      .amount_due_minor,
    Math.floor(c.t.amount_minor),
  );
  assert.notEqual(
    sql(
      `update public.cv_gateway_observations set snapshot='{}' where attempt_id='${c.t.id}'`,
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(
      `update public.cv_gateway_attempts set amount_minor=1 where id='${c.t.id}'`,
      false,
    ).status,
    0,
  );
});
test("early paid renewal schedules at the existing boundary without resetting current quota", () => {
  const c = prepared();
  captured(c);
  const old = value("select public.cv_subscription_status()", c.a).period;
  const q = getQuote(c.p, c.a, "renewal"),
    i = accept(q.id, c.a),
    t = value(
      `select public.cv_prepare_checkout('${i.payment_intent_id}')`,
      c.a,
    );
  const d = {
    ...c,
    q,
    i,
    t,
    order: `order_${t.id.replaceAll("-", "")}`,
    payment: `pay_${t.id.replaceAll("-", "")}`,
  };
  sql(
    service(
      `select public.cv_bind_gateway_order('${t.id}','${d.order}','${t.receipt}',${t.amount_minor},'INR')`,
    ),
  );
  captured(d);
  const status = value("select public.cv_subscription_status()", c.a);
  assert.equal(status.period.id, old.id);
  assert.equal(
    status.requests.find((r: { id: string }) => r.id === q.id).status,
    "scheduled",
  );
  clock(32);
  const later = value("select public.cv_subscription_status()", c.a);
  assert.notEqual(later.period.id, old.id);
  assert.equal(later.period.payment_status, "captured");
  clock();
});
test("partial refunds preserve access and full refunds remove entitlement without editing period evidence", () => {
  const c = prepared();
  captured(c);
  const period = value("select public.cv_subscription_status()", c.a).period.id;
  sql(observe(c, { refund: 100 }));
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    true,
  );
  sql(observe(c, { refund: c.t.amount_minor, status: "refunded" }));
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
  sql(observe(c));
  assert.equal(
    value(`select public.cv_payment_attempt('${c.t.id}')`, c.a).state,
    "refunded",
  );
  assert.equal(
    sql(
      `select payment_status from public.cv_billing_periods where id='${period}'`,
    ).out,
    "captured",
  );
});
test("disputes block the related period and stale captured notifications cannot restore it", () => {
  const c = prepared();
  captured(c);
  sql(observe(c, { disputed: true }));
  sql(observe(c));
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
  assert.equal(
    value(`select public.cv_payment_attempt('${c.t.id}')`, c.a).state,
    "disputed",
  );
});
test("uncertain order creation is never automatically repeated and refund commands require MFA and reasons", () => {
  const a = account(),
    p = plan(),
    q = getQuote(p, a),
    i = accept(q.id, a);
  const first = value(
    `select public.cv_prepare_checkout('${i.payment_intent_id}')`,
    a,
  );
  const second = value(
    `select public.cv_prepare_checkout('${i.payment_intent_id}')`,
    a,
  );
  assert.equal(first.create_order, true);
  assert.equal(second.create_order, false);
  assert.equal(second.id, first.id);
  const c = prepared();
  captured(c);
  assert.notEqual(
    sql(
      superAs(
        `select public.cv_prepare_refund('${c.t.id}',100,'reason')`,
        "aal1",
      ),
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(superAs(`select public.cv_prepare_refund('${c.t.id}',100,'')`), false)
      .status,
    0,
  );
  const command = JSON.parse(
    admin(
      `select public.cv_prepare_refund('${c.t.id}',100,'Approved test refund')`,
    ),
  );
  assert.ok(command.id);
  assert.notEqual(
    sql(
      superAs(
        `select public.cv_prepare_refund('${c.t.id}',100,'Duplicate external request')`,
      ),
      false,
    ).status,
    0,
  );
});
test("service role can only use narrow payment interfaces, not raw tables or unchecked period helpers", () => {
  for (const table of [
    "cv_gateway_attempts",
    "cv_gateway_observations",
    "cv_paid_settlements",
    "cv_refund_commands",
  ])
    assert.equal(
      sql(
        `select has_table_privilege('service_role','public.${table}','SELECT')`,
      ).out,
      "f",
    );
  assert.equal(
    sql(
      "select has_function_privilege('service_role','public.cv_materialize_billing_quote(uuid)','EXECUTE')",
    ).out,
    "f",
  );
  assert.equal(
    sql(
      "select has_function_privilege('authenticated','public.cv_process_gateway_payment(text,text,bigint,text,text,bigint,text,text,boolean)','EXECUTE')",
    ).out,
    "f",
  );
});

test("null or malformed verification fields cannot activate an unpaid quote", () => {
  const c = prepared();
  for (const field of ["p_status", "p_amount", "p_currency", "p_disputed"]) {
    const args = {
      p_order: `'${c.order}'`,
      p_payment: `'${c.payment}'`,
      p_amount: String(c.t.amount_minor),
      p_currency: "'INR'",
      p_status: "'captured'",
      p_refunded: "0",
      p_event: `'${randomUUID()}'`,
      p_fingerprint: `'${"a".repeat(64)}'`,
      p_disputed: "false",
    };
    args[field as keyof typeof args] = "null";
    assert.notEqual(
      sql(
        service(
          `select public.cv_process_gateway_payment(${Object.entries(args)
            .map(([key, v]) => key + "=>" + v)
            .join(",")})`,
        ),
        false,
      ).status,
      0,
    );
  }
  assert.equal(
    value("select public.cv_subscription_status()", c.a).entitled,
    false,
  );
});
test("financial reports expose refund state rather than a stale paid ledger status", () => {
  const c = prepared();
  captured(c);
  sql(observe(c, { refund: c.t.amount_minor, status: "refunded" }));
  const status = value("select public.cv_subscription_status()", c.a);
  assert.equal(status.payments[0].status, "refunded");
  assert.equal(status.payments[0].attempt_id, c.t.id);
  assert.equal(
    admin(`select public.cv_platform_account('${c.a}')->'account'->>'subscription_status'`),
    "expired",
  );
});
