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
function grant(p: string, account = ids.a, seats = 5) {
  return JSON.parse(
    admin(
      `select public.cv_admin_grant_subscription('${account}','${p}',${seats},'Approved isolated complimentary access')`,
    ),
  );
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
function issue(label: string, account = ids.a) {
  return as(
    ids.member,
    account,
    `insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.member}','${account}',${literal(label)},'${account === ids.a ? ids.templateA : ids.templateB}','Active') returning id`,
  );
}
function clock(days = 0) {
  sql(
    `create or replace function public.cv_billing_now() returns timestamptz language sql volatile set search_path='' as $$ select clock_timestamp()+interval '${days} days' $$`,
  );
}
let limited: string;
let unlimited: string;
test("plans are versioned and ordinary owners cannot assign prices or platform billing privileges", () => {
  limited = plan();
  unlimited = plan(
    planTerms({
      name: "Unlimited Enterprise",
      certificate_limit: null,
      audience: "enterprise",
      visible: false,
    }),
  );
  for (const statement of [
    "select * from public.cv_plans",
    `select public.cv_save_plan(${literal(JSON.stringify(planTerms()))}::jsonb)`,
    "select public.cv_platform_billing_catalog()",
    `select public.cv_admin_grant_subscription('${ids.a}','${limited}',5,'Bypass')`,
  ])
    assert.notEqual(
      sql(as(ids.owner, ids.a, statement, "aal2"), false).status,
      0,
    );
  assert.notEqual(
    sql(superAs("select public.cv_platform_billing_catalog()", "aal1"), false)
      .status,
    0,
  );
});
test("database plan/offer validation rejects nulls, invalid money, bounds and contradictory eligibility", () => {
  for (const patch of [
    { price_minor: null },
    { name: null },
    { visible: null },
    { included_seats: 0 },
    { certificate_limit: -1 },
    { max_seats: 2 },
    { currency: "wrong" },
    { features: [{ bad: true }] },
    { eligibility: [] },
  ])
    assert.equal(
      sql(
        `select public.cv_validate_plan(${literal(JSON.stringify({ ...planTerms(), ...patch }))}::jsonb)`,
      ).out,
      "f",
    );
  assert.equal(
    sql(
      `select public.cv_validate_offer(${literal(JSON.stringify({ ...offerTerms(), kind: "fixed", currency: null }))}::jsonb)`,
    ).out,
    "f",
  );
});
test("unsubscribed accounts retain billing/read access but cannot issue or manage paid templates", () => {
  assert.equal(
    value("select public.cv_subscription_status()").status,
    "unsubscribed",
  );
  assert.equal(
    value("select public.cv_subscription_status()").can_manage,
    true,
  );
  assert.notEqual(sql(issue("unsubscribed"), false).status, 0);
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        `insert into public.certificate_templates(user_id,account_id,name) values('${ids.owner}','${ids.a}','Unpaid')`,
      ),
      false,
    ).status,
    0,
  );
  assert.equal(
    sql(as(ids.member, ids.a, "select count(*) from public.certificates")).out,
    "1",
  );
});
test("paid quotes use server prices including extra seats and cannot activate before payment", () => {
  const q = getQuote(limited, ids.a, "start", "", 7);
  assert.equal(q.quote.amount_due_minor, 119700);
  assert.equal(accept(q.id).status, "awaiting_payment");
  assert.equal(value("select public.cv_subscription_status()").entitled, false);
  assert.notEqual(
    sql(
      as(ids.owner, ids.a, "update public.cv_billing_quotes set quote='{}'"),
      false,
    ).status,
    0,
  );
  value(`select public.cv_subscription_action('cancel_request','${q.id}')`);
  assert.equal(sql("select count(*) from public.cv_payment_intents").out, "1");
});
test("explicit complimentary grants are waived, audited and do not record a fake payment", () => {
  assert.equal(grant(limited).status, "applied");
  grant(limited, ids.b);
  const status = value("select public.cv_subscription_status()");
  assert.equal(status.period.payment_status, "waived");
  assert.equal(status.period.remaining_certificates, 2);
  assert.equal(sql("select count(*) from public.cv_payment_events").out, "0");
  assert.equal(
    sql(
      `select count(*) from public.cv_billing_audit where action='billing.period_started' and account_id='${ids.a}'`,
    ).out,
    "1",
  );
});
let firstCertificate: string;
test("simultaneous issuance cannot exceed period quota", async () => {
  const result = await Promise.all([
    concurrentSql(issue("quota-1")),
    concurrentSql(issue("quota-2")),
    concurrentSql(issue("quota-3")),
  ]);
  assert.equal(result.filter((r) => r.status === 0).length, 2);
  firstCertificate = sql(
    "select id from public.certificates where certificate_id in ('quota-1','quota-2','quota-3') limit 1",
  ).out;
  assert.equal(
    value("select public.cv_subscription_status()").period.certificates_created,
    2,
  );
  assert.notEqual(sql(issue("quota-after"), false).status, 0);
});
test("verification and revocation do not consume or refund certificate quota; failed inserts roll back", () => {
  sql(
    as(
      ids.owner,
      ids.a,
      `select public.cv_change_certificate_status('${firstCertificate}','Revoked','Required reason','Withdrawn')`,
    ),
  );
  for (let i = 0; i < 3; i++)
    sql(
      `set role anon;select public.cv_public_certificate('${sql(`select public_verification_id from public.certificates where id='${firstCertificate}'`).out}')`,
    );
  assert.equal(
    value("select public.cv_subscription_status()").period.certificates_created,
    2,
  );
  assert.notEqual(
    sql(
      as(
        ids.member,
        ids.a,
        `delete from public.certificates where id='${firstCertificate}'`,
      ),
      false,
    ).status,
    0,
  );
  const before = value("select public.cv_subscription_status()", ids.b).period
    .certificates_created;
  assert.notEqual(sql(issue("B-1", ids.b), false).status, 0);
  assert.equal(
    value("select public.cv_subscription_status()", ids.b).period
      .certificates_created,
    before,
  );
});
test("pending invitations reserve seats and simultaneous reservations cannot overbook", async () => {
  const calls = [
    "recipient@example.test",
    "unconfirmed@example.test",
    "extra@example.test",
  ].map((email, i) =>
    concurrentSql(
      as(
        ids.owner,
        ids.a,
        `select public.cv_prepare_invitation('${email}','${(i + 90).toString(16).padStart(64, "0")}')`,
      ),
    ),
  );
  const results = await Promise.all(calls);
  assert.equal(results.filter((r) => r.status === 0).length, 2);
  assert.equal(
    value("select public.cv_subscription_status()").allocated_seats,
    5,
  );
  const invitation = sql(
    `select id from public.account_invitations where account_id='${ids.a}' and status='pending' limit 1`,
  ).out;
  sql(
    as(ids.owner, ids.a, `select public.cv_revoke_invitation('${invitation}')`),
  );
  assert.equal(
    value("select public.cv_subscription_status()").allocated_seats,
    4,
  );
});
test("existing recipient acceptance replaces its own reservation and wrong tenants cannot use quotes", () => {
  sql(
    `update public.account_invitations set status='revoked' where account_id='${ids.a}' and status='pending'`,
  );
  const token = "a".repeat(64);
  sql(
    as(
      ids.owner,
      ids.a,
      `select public.cv_prepare_invitation('recipient@example.test','${token}')`,
    ),
  );
  sql(
    as(ids.recipient, null, `select public.cv_accept_invitation('${token}')`),
  );
  assert.equal(
    value("select public.cv_subscription_status()").allocated_seats,
    4,
  );
  const q = getQuote(limited, ids.b);
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        `select public.cv_accept_subscription('${q.id}','${randomUUID()}')`,
      ),
      false,
    ).status,
    0,
  );
  assert.equal(
    value("select public.cv_subscription_status()", ids.a, ids.member).history
      .length,
    0,
  );
});
test("editing and retiring current catalog does not reprice historical periods or agreed renewals", () => {
  const old = value("select public.cv_subscription_status()").history[0]
    .plan_snapshot;
  const revision = sql(
    `select revision from public.cv_plans where id='${limited}'`,
  ).out;
  admin(
    `select public.cv_save_plan(${literal(JSON.stringify(planTerms({ price_minor: 99900, renewal_price_minor: 199900 })))}::jsonb,'${limited}',${revision})`,
  );
  const renewed = getQuote(limited, ids.a, "renewal");
  assert.equal(renewed.quote.amount_due_minor, 49900);
  assert.equal(
    value("select public.cv_subscription_status()").history[0].plan_snapshot
      .price_minor,
    old.price_minor,
  );
  admin(
    `select public.cv_set_catalog_status('plan','${limited}','archived',${Number(revision) + 1})`,
  );
  assert.equal(
    getQuote(limited, ids.a, "renewal").quote.amount_due_minor,
    49900,
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        `select public.cv_quote_subscription('${limited}',5,null,'change')`,
      ),
      false,
    ).status,
    0,
  );
});
test("expiry blocks issuance/templates/invitations and billing/history remain accessible", () => {
  clock(40);
  const status = value("select public.cv_subscription_status()");
  assert.equal(status.status, "expired");
  assert.equal(status.can_manage, true);
  assert.notEqual(sql(issue("expired"), false).status, 0);
  assert.notEqual(
    sql(as(ids.owner, ids.a, "select public.cv_reserve_logo()"), false).status,
    0,
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        "select public.cv_request_branding('Expired Company','',null,'')",
      ),
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        `select public.cv_prepare_invitation('expired@example.test','${"b".repeat(64)}')`,
      ),
      false,
    ).status,
    0,
  );
  const publicRecord = JSON.parse(
    sql(
      `set role anon;select public.cv_public_certificate('${sql(`select public_verification_id from public.certificates where id='${firstCertificate}'`).out}')`,
    ).out,
  );
  assert.equal(publicRecord.status, "Revoked");
  assert.equal(publicRecord.issuer_name, "Account A");
  clock();
});
test("cancellation stops renewal without ending the paid period and resume does not create access", () => {
  value("select public.cv_subscription_action('cancel_renewal')");
  assert.equal(
    value("select public.cv_subscription_status()").status,
    "non_renewing",
  );
  assert.equal(value("select public.cv_subscription_status()").entitled, true);
  clock(40);
  assert.equal(
    value("select public.cv_subscription_status()").status,
    "cancelled",
  );
  value("select public.cv_subscription_action('resume_renewal')");
  assert.equal(value("select public.cv_subscription_status()").entitled, false);
  clock();
});
test("unlimited enterprise plans remain metered for history without blocking issuance", () => {
  clock(40);
  grant(unlimited);
  clock(40);
  for (let i = 0; i < 4; i++) sql(issue(`unlimited-${i}`));
  const status = value("select public.cv_subscription_status()");
  assert.equal(status.period.certificate_limit, null);
  assert.equal(status.period.certificates_created, 4);
  assert.equal(status.period.remaining_certificates, null);
  clock();
});
function newAccount(type = "organization") {
  const id = randomUUID();
  sql(
    `insert into public.accounts(id,account_name,account_type) values('${id}','New billing customer','${type}');insert into public.account_members(account_id,user_id,role,status) values('${id}','${ids.owner}','owner','active')`,
  );
  return id;
}
let trialPlan: string;
let trialAccount: string;
test("a free trial is server-authorized once per account and another plan cannot reset it", () => {
  trialPlan = plan(
    planTerms({
      name: "Trial plan",
      included_seats: 1,
      max_seats: 2,
      certificate_limit: 1,
      trial_days: 7,
    }),
  );
  trialAccount = newAccount();
  const q = getQuote(trialPlan, trialAccount, "trial", "", 1);
  assert.equal(q.quote.amount_due_minor, 0);
  const nonce = randomUUID();
  const accepted = accept(q.id, trialAccount, nonce);
  assert.equal(accepted.status, "applied");
  assert.equal(accept(q.id, trialAccount, nonce).status, "applied");
  assert.equal(
    value("select public.cv_subscription_status()", trialAccount).status,
    "trial",
  );
  clock(8);
  assert.equal(
    value("select public.cv_subscription_status()", trialAccount).status,
    "expired",
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        trialAccount,
        `select public.cv_quote_subscription('${trialPlan}',1,null,'trial')`,
      ),
      false,
    ).status,
    0,
  );
  clock();
});
test("percentage/fixed/introductory coupons use server integer math, currency and audience restrictions", () => {
  const account = newAccount();
  const p = plan(
    planTerms({
      name: "Promotion calculations",
      price_minor: 12345,
      renewal_price_minor: 23456,
      included_seats: 1,
      max_seats: 2,
    }),
  );
  offer(
    "PERCENT25",
    offerTerms({ value: 2500, audience: "new", plan_ids: [p] }),
  );
  assert.equal(
    getQuote(p, account, "start", "PERCENT25", 1).quote.amount_due_minor,
    9259,
  );
  offer("FIXED", offerTerms({ kind: "fixed", currency: "INR", value: 2000 }));
  assert.equal(
    getQuote(p, account, "start", "FIXED", 1).quote.amount_due_minor,
    10345,
  );
  offer(
    "INTRO",
    offerTerms({
      kind: "intro_price",
      currency: "INR",
      value: 5000,
      cycles: 3,
    }),
  );
  assert.equal(
    getQuote(p, account, "start", "INTRO", 1).quote.amount_due_minor,
    5000,
  );
  offer("USDONLY", offerTerms({ kind: "fixed", currency: "USD", value: 1 }));
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_quote_subscription('${p}',1,'USDONLY','start')`,
      ),
      false,
    ).status,
    0,
  );
  offer(
    "SELECTED",
    offerTerms({ audience: "selected", account_ids: [trialAccount] }),
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_quote_subscription('${p}',1,'SELECTED','start')`,
      ),
      false,
    ).status,
    0,
  );
});
test("scheduled offer expiry and disabled campaigns prevent new redemptions", () => {
  const account = newAccount();
  offer("EXPIRED", offerTerms({ ends_at: "2020-01-01T00:00:00Z" }));
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_quote_subscription('${trialPlan}',1,'EXPIRED','start')`,
      ),
      false,
    ).status,
    0,
  );
  const id = offer("DISABLED");
  admin(`select public.cv_set_catalog_status('offer','${id}','inactive',2)`);
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_quote_subscription('${trialPlan}',1,'DISABLED','start')`,
      ),
      false,
    ).status,
    0,
  );
});
test("concurrent cross-account coupon acceptance honors the global redemption limit", async () => {
  const a = newAccount();
  const b = newAccount();
  const p = plan(planTerms({ included_seats: 1, max_seats: 2 }));
  offer("LASTFREE", offerTerms({ max_redemptions: 1 }));
  const qa = getQuote(p, a, "start", "LASTFREE", 1);
  const qb = getQuote(p, b, "start", "LASTFREE", 1);
  const results = await Promise.all([
    concurrentSql(
      as(
        ids.owner,
        a,
        `select public.cv_accept_subscription('${qa.id}','${randomUUID()}')`,
      ),
    ),
    concurrentSql(
      as(
        ids.owner,
        b,
        `select public.cv_accept_subscription('${qb.id}','${randomUUID()}')`,
      ),
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 0).length, 1);
  assert.equal(
    sql("select redemption_count from public.cv_offers where code='LASTFREE'")
      .out,
    "1",
  );
});
test("introductory free cycles transition to the agreed regular renewal amount even after campaign expiry", () => {
  const account = newAccount();
  const p = plan(
    planTerms({
      name: "Intro cycles",
      price_minor: 10000,
      renewal_price_minor: 20000,
      included_seats: 1,
      max_seats: 2,
    }),
  );
  const o = offer("TWOFREE", offerTerms({ cycles: 2 }));
  accept(getQuote(p, account, "start", "TWOFREE", 1).id, account);
  admin(`select public.cv_set_catalog_status('offer','${o}','inactive',2)`);
  const renewal = getQuote(p, account, "renewal", "", 1);
  assert.equal(renewal.quote.amount_due_minor, 0);
  assert.equal(accept(renewal.id, account).status, "scheduled");
  const before = value("select public.cv_subscription_status()", account).period
    .id;
  clock(32);
  const after = value("select public.cv_subscription_status()", account);
  assert.notEqual(after.period.id, before);
  assert.equal(after.period.certificates_created, 0);
  assert.equal(
    getQuote(p, account, "renewal", "", 1).quote.amount_due_minor,
    20000,
  );
  clock();
});
test("free plan changes schedule at the boundary without resetting consumed quota mid-period", () => {
  const account = newAccount();
  const p = plan(
    planTerms({
      name: "Free limited",
      price_minor: 0,
      renewal_price_minor: 0,
      included_seats: 1,
      max_seats: 2,
      certificate_limit: 1,
    }),
  );
  const other = plan(
    planTerms({
      name: "Free upgrade",
      price_minor: 0,
      renewal_price_minor: 0,
      included_seats: 1,
      max_seats: 2,
      certificate_limit: 2,
    }),
  );
  accept(getQuote(p, account, "start", "", 1).id, account);
  const template = sql(
    as(
      ids.owner,
      account,
      `insert into public.certificate_templates(user_id,account_id,name) values('${ids.owner}','${account}','Billing template') returning id`,
    ),
  ).out;
  const issueNew = (label: string) =>
    as(
      ids.owner,
      account,
      `insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.owner}','${account}',${literal(label)},'${template}','Active') returning id`,
    );
  sql(issueNew("free-limited"));
  const change = getQuote(other, account, "change", "", 1);
  assert.equal(accept(change.id, account).status, "scheduled");
  assert.equal(
    value("select public.cv_subscription_status()", account).period
      .remaining_certificates,
    0,
  );
  assert.notEqual(sql(issueNew("no-reset"), false).status, 0);
  clock(32);
  assert.equal(
    value("select public.cv_subscription_status()", account).period
      .certificate_limit,
    2,
  );
  sql(issueNew("upgraded"));
  clock();
});
test("quote expiry, stale subscriptions and replay with another nonce fail closed", () => {
  const account = newAccount();
  const p = plan(planTerms({ included_seats: 1, max_seats: 2 }));
  const q = getQuote(p, account, "trial", "", 1);
  clock(1);
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_accept_subscription('${q.id}','${randomUUID()}')`,
      ),
      false,
    ).status,
    0,
  );
  clock();
  const q2 = getQuote(p, account, "trial", "", 1);
  accept(q2.id, account);
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_accept_subscription('${q2.id}','${randomUUID()}')`,
      ),
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(
      as(
        ids.member,
        ids.a,
        `select public.cv_quote_subscription('${p}',1,null,'start')`,
      ),
      false,
    ).status,
    0,
  );
});
test("financial records, price versions and consumed usage evidence cannot be overwritten or deleted", () => {
  for (const table of [
    "cv_plan_versions",
    "cv_offer_versions",
    "cv_billing_periods",
    "cv_certificate_consumptions",
    "cv_offer_redemptions",
    "cv_payment_intents",
    "cv_billing_audit",
  ]) {
    assert.notEqual(sql(`delete from public.${table}`, false).status, 0);
  }
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        "update public.cv_period_usage set certificates_created=0",
      ),
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        "select public.cv_accept_billing_quote(null,null,null)",
      ),
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(as(ids.owner, ids.a, "select public.cv_billing_now()"), false).status,
    0,
  );
  const report = JSON.parse(
    admin(`select public.cv_platform_subscription_report('${trialAccount}',1)`),
  );
  assert.equal(report.accounts.length, 1);
  assert.ok(report.audit.length > 0);
  assert.ok(
    report.accounts.every((a: { id: string }) => a.id === trialAccount),
  );
});
test("monthly and annual boundaries follow calendar dates rather than fixed day approximations", () => {
  const monthly = sql(
    `select public.cv_period_end('2028-01-31T00:00:00Z',${literal(JSON.stringify(planTerms()))}::jsonb)`,
  ).out;
  assert.match(monthly, /2028-02-29/);
  const annual = sql(
    `select public.cv_period_end('2028-02-29T00:00:00Z',${literal(JSON.stringify(planTerms({ billing_period: "annual" })))}::jsonb)`,
  ).out;
  assert.match(annual, /2029-02-28/);
});
test("trusted financial guards preserve quoted terms, trial history, consumed counts and non-overlapping periods", () => {
  assert.notEqual(
    sql("update public.cv_billing_quotes set quote='{}'", false).status,
    0,
  );
  assert.notEqual(
    sql(
      "update public.cv_subscriptions set trial_used=false where trial_used",
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(
      "update public.cv_period_usage set certificates_created=0 where certificates_created>0",
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(
      `insert into public.cv_billing_periods(account_id,plan_version_id,plan_snapshot,starts_at,ends_at,licensed_seats,certificate_limit,list_amount_minor,amount_due_minor,currency,access_kind,payment_status,created_by) select account_id,plan_version_id,plan_snapshot,starts_at,ends_at,licensed_seats,certificate_limit,list_amount_minor,amount_due_minor,currency,access_kind,payment_status,created_by from public.cv_billing_periods limit 1`,
      false,
    ).status,
    0,
  );
});
test("payment ledger events must match intent amount/currency and cannot activate paid access", () => {
  const row = JSON.parse(
    sql("select to_jsonb(i) from public.cv_payment_intents i limit 1").out,
  );
  assert.notEqual(
    sql(
      `insert into public.cv_payment_events(intent_id,provider,event_reference,status,amount_minor,currency) values('${row.id}','test-provider','bad-currency','paid',${row.amount_minor},'USD')`,
      false,
    ).status,
    0,
  );
  sql(
    `insert into public.cv_payment_events(intent_id,provider,event_reference,status,amount_minor,currency) values('${row.id}','test-provider','failure-fixture','failed',${row.amount_minor},'${row.currency}')`,
  );
  assert.notEqual(
    sql(
      `insert into public.cv_payment_events(intent_id,provider,event_reference,status,amount_minor,currency) values('${row.id}','test-provider','failure-fixture','failed',${row.amount_minor},'${row.currency}')`,
      false,
    ).status,
    0,
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        ids.a,
        `insert into public.cv_payment_events(intent_id,provider,event_reference,status,amount_minor,currency) values('${row.id}','fake','fake-paid','paid',${row.amount_minor},'${row.currency}')`,
      ),
      false,
    ).status,
    0,
  );
  assert.notEqual(sql("delete from public.cv_payment_events", false).status, 0);
});
test("unconfirmed owners cannot activate trials and suspended owners can still stop renewal", () => {
  const account = newAccount();
  sql(
    `update public.account_members set user_id='${ids.unconfirmed}' where account_id='${account}'`,
  );
  assert.notEqual(
    sql(
      as(
        ids.unconfirmed,
        account,
        `select public.cv_quote_subscription('${trialPlan}',1,null,'trial')`,
      ),
      false,
    ).status,
    0,
  );
  admin(
    `select public.cv_platform_set_account_access('${trialAccount}','suspended','Billing support review',0)`,
  );
  assert.equal(
    value("select public.cv_subscription_status()", trialAccount).can_manage,
    false,
  );
  assert.equal(
    value(
      "select public.cv_subscription_action('cancel_renewal')",
      trialAccount,
    ),
    true,
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        trialAccount,
        "select public.cv_subscription_action('resume_renewal')",
      ),
      false,
    ).status,
    0,
  );
  admin(
    `select public.cv_platform_set_account_access('${trialAccount}','active','Review completed',1)`,
  );
});
test("customer quote/history redacts other accounts and private campaign targeting", () => {
  const account = newAccount();
  const other = newAccount();
  const p = plan(planTerms({ included_seats: 1, max_seats: 2 }));
  offer(
    "PRIVATECAMPAIGN",
    offerTerms({
      audience: "selected",
      account_ids: [account, other],
      plan_ids: [p],
    }),
  );
  const q = getQuote(p, account, "start", "PRIVATECAMPAIGN", 1);
  assert.ok(!JSON.stringify(q).includes(other));
  assert.equal(q.quote.offer_terms.account_ids, undefined);
  accept(q.id, account);
  const status = value("select public.cv_subscription_status()", account);
  assert.ok(!JSON.stringify(status.requests).includes(other));
  assert.equal(status.requests[0].quote.offer_terms.plan_ids, undefined);
});
test("billing read-only preflight executes without modifying financial state", () => {
  const before = sql("select count(*) from public.cv_billing_audit").out;
  sql(readFileSync("supabase/inspection/stage5-readonly.sql", "utf8"));
  assert.equal(sql("select count(*) from public.cv_billing_audit").out, before);
});
test("billing reads recheck membership after waiting for concurrent access removal", async () => {
  const removal = concurrentSql(
    `begin;set local application_name='cv-billing-removal-test';select 1 from public.accounts where id='${ids.a}' for update;select pg_sleep(2);update public.account_members set status='removed' where account_id='${ids.a}' and user_id='${ids.member}';commit;`,
  );
  let locked = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    if (
      sql(
        "select count(*) from pg_stat_activity where application_name='cv-billing-removal-test' and state='active'",
      ).out === "1"
    ) {
      locked = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(locked, true);
  const read = concurrentSql(
    as(ids.member, ids.a, "select public.cv_subscription_status()"),
  );
  const results = await Promise.all([removal, read]);
  assert.equal(results[0].status, 0);
  assert.notEqual(results[1].status, 0);
  sql(
    `update public.account_members set status='active' where account_id='${ids.a}' and user_id='${ids.member}'`,
  );
});
test("default service grants cannot expose financial tables or private activation helpers", () => {
  assert.equal(
    sql(
      "select has_table_privilege('service_role','public.cv_billing_periods','SELECT')",
    ).out,
    "f",
  );
  assert.equal(
    sql(
      "select has_function_privilege('service_role','public.cv_accept_billing_quote(uuid,uuid,uuid,text,text)','EXECUTE')",
    ).out,
    "f",
  );
  assert.equal(
    sql(
      "select has_function_privilege('service_role','public.cv_materialize_billing_quote(uuid)','EXECUTE')",
    ).out,
    "f",
  );
  assert.notEqual(
    sql("set role service_role;select * from public.cv_payment_intents", false)
      .status,
    0,
  );
});
test("client intent cannot obtain renewal pricing before enrollment or repeat initial pricing", () => {
  const account = newAccount();
  const p = plan(
    planTerms({
      name: "Introductory base price",
      price_minor: 100,
      renewal_price_minor: 900,
      included_seats: 1,
      max_seats: 2,
    }),
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_quote_subscription('${p}',1,null,'renewal')`,
      ),
      false,
    ).status,
    0,
  );
  grant(p, account, 1);
  assert.equal(
    getQuote(p, account, "start", "", 1).quote.amount_due_minor,
    900,
  );
  assert.equal(
    getQuote(p, account, "change", "", 1).quote.amount_due_minor,
    900,
  );
  const other = plan(
    planTerms({ name: "Other enrollment", included_seats: 1, max_seats: 2 }),
  );
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_quote_subscription('${other}',1,null,'renewal')`,
      ),
      false,
    ).status,
    0,
  );
});
test("deactivation after quoting prevents new enrollment without rewriting the price snapshot", () => {
  const account = newAccount();
  const p = plan(
    planTerms({
      name: "Sales stop",
      price_minor: 0,
      renewal_price_minor: 0,
      included_seats: 1,
      max_seats: 2,
    }),
  );
  const q = getQuote(p, account, "start", "", 1);
  admin(`select public.cv_set_catalog_status('plan','${p}','inactive',2)`);
  assert.notEqual(
    sql(
      as(
        ids.owner,
        account,
        `select public.cv_accept_subscription('${q.id}','${randomUUID()}')`,
      ),
      false,
    ).status,
    0,
  );
  assert.equal(
    value("select public.cv_subscription_status()", account).entitled,
    false,
  );
});
