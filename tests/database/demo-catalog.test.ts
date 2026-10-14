import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabaseHarness } from "./harness";

const { start, close, sql, as, ids, concurrentSql, quote } = createDatabaseHarness({ freshStaging: true });
const source = readFileSync("supabase/operations/sandbox-demo-catalog.sql", "utf8");
const seed = source.replace("'CATALOG_SEED_APPROVAL_REQUIRED'", "'fixture-approved-synthetic-seed'");
let account = "", plan = "", originalVersion = "";
before(async () => {
  await start();
  sql(`insert into auth.users(id,email,email_confirmed_at) values('${ids.owner}','owner@example.test',now())`);
  account = sql(`select account_id from public.account_members where user_id='${ids.owner}'`).out;
});
after(close);
test("synthetic catalog seed rejects untouched approval and wrong project input", () => {
  assert.ok(!/^\\/m.test(source));
  assert.notEqual(sql(source, false).status, 0);
  for (const project of ["jhnxztaqfikgvkshifel", "abcdefghijklmnopqrst"]) {
    const invalid = seed.replace("'fixture-approved-synthetic-seed','nubohxesjeaodqcveiud'", `'fixture-approved-synthetic-seed','${project}'`);
    assert.notEqual(sql(invalid, false).status, 0);
  }
  assert.equal(sql("select count(*) from public.cv_plans").out, "0");
});
test("anonymous, authenticated and service-role app credentials cannot self-seed catalog", () => {
  const body = seed.replace(/^begin;/m, "").replace(/^commit;/m, "");
  assert.notEqual(sql(as(ids.owner, account, body, "aal2"), false).status, 0);
  for (const role of ["anon", "service_role"]) {
    assert.notEqual(sql(`begin;set local role ${role};${body};commit;`, false).status, 0);
    assert.equal(sql(`select has_table_privilege('${role}','public.cv_plans','INSERT')`).out, "f");
  }
});
test("concurrent approved DBA seed creates one editable plan and honest immutable operator evidence", async () => {
  const results = await Promise.all([concurrentSql(seed), concurrentSql(seed)]);
  assert.equal(results.filter(r => r.status === 0).length, 1, results.map(r => r.error).join("\n"));
  assert.equal(sql("select count(*) from public.cv_plans").out, "1");
  assert.equal(sql("select count(*) from public.cv_plan_versions").out, "1");
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
  assert.equal(sql("select count(*) from public.cv_subscriptions").out, "0");
  assert.equal(sql("select count(*) from public.cv_billing_periods").out, "0");
  plan = sql("select id from public.cv_plans").out;
  originalVersion = sql("select current_version_id from public.cv_plans").out;
  const evidence = JSON.parse(sql("select details from public.cv_platform_audit_events where action='platform.sandbox_catalog_seeded'").out);
  assert.equal(evidence.actor_kind, "database_operator");
  assert.equal(evidence.database_operator, "postgres");
  assert.equal(evidence.no_authentication_claims_impersonated, true);
  assert.equal(evidence.platform_privileges_granted, 0);
  assert.equal(sql(`select count(*) from auth.users where id='${evidence.external_operator_actor_id}'`).out, "0");
  assert.equal(sql("select count(*) from public.cv_billing_audit where action='billing.sandbox_catalog_seeded'").out, "1");
  assert.notEqual(sql("update public.cv_platform_audit_events set details='{}'::jsonb", false).status, 0);
  assert.notEqual(sql("update public.cv_billing_audit set details='{}'::jsonb", false).status, 0);
});
test("replaying the seed refuses clearly instead of duplicating or resetting catalog history", () => {
  const replay = sql(seed, false);
  assert.notEqual(replay.status, 0);
  assert.ok(replay.error.includes("already seeded"));
  assert.equal(sql("select count(*) from public.cv_plan_versions").out, "1");
});
test("ordinary verified customer can select synthetic trial without any gateway or paid activation", () => {
  const catalog = JSON.parse(sql("set role anon;select public.cv_pricing_catalog()").out);
  assert.equal(catalog.length, 1);
  assert.ok(catalog[0].terms.name.startsWith("STAGING ONLY"));
  assert.equal(catalog[0].terms.price_minor, 0);
  assert.equal(catalog[0].terms.certificate_limit, 5);
  assert.equal(catalog[0].terms.included_seats, 3);
  const billingQuote = JSON.parse(sql(as(ids.owner, account, `select public.cv_quote_subscription('${plan}',3,null,'trial')`)).out);
  const accepted = JSON.parse(sql(as(ids.owner, account, `select public.cv_accept_subscription('${billingQuote.id}',gen_random_uuid())`)).out);
  assert.equal(accepted.status, "applied");
  const status = JSON.parse(sql(as(ids.owner, account, "select public.cv_subscription_status()")).out);
  assert.equal(status.status, "trial");
  assert.equal(status.entitled, true);
  assert.equal(status.period.payment_status, "no_payment_required");
  for (const table of ["cv_payment_intents", "cv_payment_events", "cv_gateway_attempts", "cv_paid_settlements"]) {
    assert.equal(sql(`select count(*) from public.${table}`).out, "0");
  }
});
test("synthetic trial enforces concurrent certificate quota and reserved invitation seats", async () => {
  const template = sql(as(ids.owner, account, `insert into public.certificate_templates(user_id,account_id,name) values('${ids.owner}','${account}','Synthetic trial template') returning id`)).out;
  const issued = await Promise.all(Array.from({ length: 6 }, () => concurrentSql(as(ids.owner, account,
    `insert into public.certificates(user_id,account_id,template_id,certificate_id) values('${ids.owner}','${account}','${template}',public.cv_generate_certificate_id())`))));
  assert.equal(issued.filter(r => r.status === 0).length, 5);
  assert.equal(sql(as(ids.owner, account, "select public.cv_subscription_status()->'period'->>'remaining_certificates'")).out, "0");
  sql(as(ids.owner, account, "select public.cv_upgrade_account()"));
  for (let n = 1; n <= 2; n++) sql(as(ids.owner, account, `select public.cv_prepare_invitation('synthetic${n}@example.test','${String(n).repeat(64)}')`));
  assert.notEqual(sql(as(ids.owner, account, `select public.cv_prepare_invitation('synthetic3@example.test','${"3".repeat(64)}')`), false).status, 0);
  assert.equal(sql("select count(*) from public.cv_payment_events").out, "0");
});
test("trial terms remain stored editable versions rather than application prices", () => {
  // Separate disposable admin fixture, never supplied by seed or hosted grant.
  sql(`insert into public.cv_platform_admins(user_id) values('${ids.owner}')`);
  const original = JSON.parse(sql(`select terms from public.cv_plan_versions where id='${originalVersion}'`).out);
  const edited = { ...original, certificate_limit: 8, name: "STAGING ONLY — Updated Synthetic Trial" };
  sql(as(ids.owner, null, `select public.cv_save_plan(${quote(JSON.stringify(edited))}::jsonb,'${plan}',1)`, "aal2"));
  assert.equal(sql("select count(*) from public.cv_plan_versions").out, "2");
  assert.equal(sql(`select terms->>'certificate_limit' from public.cv_plan_versions where id='${originalVersion}'`).out, "5");
  assert.equal(sql(as(ids.owner, account, "select public.cv_subscription_status()->'period'->>'certificate_limit'")).out, "5");
  assert.equal(sql("set role anon;select public.cv_pricing_catalog()->0->'terms'->>'certificate_limit'").out, "8");
});
