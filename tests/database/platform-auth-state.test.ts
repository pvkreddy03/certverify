import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { createDatabaseHarness } from "./harness";

const { start, close, sql, as, ids, quote } = createDatabaseHarness({ freshStaging: true });
let account = "", otherAccount = "", certificate = "", reference = "";
const invalidStates = [
  "banned_until=now()+interval '1 day'",
  "deleted_at=now()",
  "is_anonymous=true",
  "email_confirmed_at=null",
];
function restore(user: string) {
  sql(`update auth.users set banned_until=null,deleted_at=null,is_anonymous=false,email_confirmed_at=now() where id='${user}'`);
}
before(async () => {
  await start();
  sql(`alter table auth.users add column banned_until timestamptz,add column deleted_at timestamptz,add column is_anonymous boolean default false;
    insert into auth.users(id,email,email_confirmed_at) values
      ('${ids.owner}','owner@example.test',now()),
      ('${ids.member}','member@example.test',now()),
      ('${ids.other}','other@example.test',now());
    insert into public.cv_platform_admins(user_id) values('${ids.owner}');`);
  account = sql(`select account_id from public.account_members where user_id='${ids.owner}'`).out;
  otherAccount = sql(`select account_id from public.account_members where user_id='${ids.other}'`).out;
  // Explicit disposable admin fixture; never a hosted privilege grant or real MFA.
  const terms = { name: "Synthetic Auth-state trial", description: "Disposable security regression only", eligibility: ["individual", "organization"], audience: "standard", billing_period: "monthly", custom_days: 30, price_minor: 0, renewal_price_minor: 0, currency: "INR", currency_exponent: 2, included_seats: 5, extra_seat_price_minor: 0, max_seats: 5, certificate_limit: 20, trial_days: 7, visible: true, features: ["QR"], starts_at: null, ends_at: null };
  const plan = sql(as(ids.owner, null, `select public.cv_save_plan(${quote(JSON.stringify(terms))}::jsonb)`, "aal2")).out;
  sql(as(ids.owner, null, `select public.cv_set_catalog_status('plan','${plan}','active',1)`, "aal2"));
  const billingQuote = JSON.parse(sql(as(ids.owner, account, `select public.cv_quote_subscription('${plan}',5,null,'trial')`)).out);
  sql(as(ids.owner, account, `select public.cv_accept_subscription('${billingQuote.id}',gen_random_uuid());select public.cv_upgrade_account()`));
  sql(`insert into public.account_members(account_id,user_id,role,status) values('${account}','${ids.member}','member','active')`);
  const template = sql(as(ids.owner, account, `insert into public.certificate_templates(user_id,account_id,name) values('${ids.owner}','${account}','Auth-state template') returning id`)).out;
  reference = sql(as(ids.member, account, "select public.cv_generate_certificate_id()")).out;
  certificate = sql(as(ids.member, account, `insert into public.certificates(user_id,account_id,template_id,certificate_id) values('${ids.member}','${account}','${template}',${quote(reference)}) returning id`)).out;
});
after(close);

test("active confirmed platform identities still require assigned privilege and AAL2", () => {
  assert.equal(sql(as(ids.owner, account, "select public.cv_is_platform_admin()", "aal2")).out, "t");
  assert.equal(sql(as(ids.owner, account, "select public.cv_is_platform_admin()", "aal1")).out, "f");
  assert.equal(sql(as(ids.member, account, "select public.cv_is_platform_admin()", "aal2")).out, "f");
});
test("stale AAL2 claims cannot authorize banned, deleted, anonymous or unconfirmed platform administrators", () => {
  for (const state of invalidStates) {
    sql(`update auth.users set ${state} where id='${ids.owner}'`);
    assert.equal(sql(as(ids.owner, account, "select public.cv_is_platform_admin()", "aal2")).out, "f");
    assert.notEqual(sql(as(ids.owner, account, "select public.cv_platform_overview()", "aal2"), false).status, 0);
    restore(ids.owner);
  }
  assert.equal(sql(as(ids.owner, account, "select public.cv_platform_overview()->>'accounts'", "aal2")).out, "3");
});
test("stale member tokens deny tenant tables, billing and certificate RPCs after invalid Auth state", () => {
  for (const state of invalidStates) {
    sql(`update auth.users set ${state} where id='${ids.member}'`);
    assert.equal(sql(as(ids.member, account, `select public.cv_account_role('${account}')`)).out, "");
    assert.equal(sql(as(ids.member, account, `select count(*) from public.certificates where id='${certificate}'`)).out, "0");
    assert.equal(sql(as(ids.member, account, `select count(*) from public.profiles where user_id='${ids.member}'`)).out, "0");
    assert.notEqual(sql(as(ids.member, account, "select public.cv_subscription_status()"), false).status, 0);
    assert.notEqual(sql(as(ids.member, account, "select public.cv_generate_certificate_id()"), false).status, 0);
    assert.equal(sql(as(ids.member, otherAccount, "select count(*) from public.accounts")).out, "0");
    assert.equal(sql(as(ids.member, null, "select count(*) from public.cv_list_accounts()")).out, "0");
    assert.equal(sql(as(ids.member, null, "select public.cv_customer_account_states()")).out, "[]");
    restore(ids.member);
  }
});
test("restored Auth identity regains its existing membership without crossing tenant boundaries", () => {
  assert.equal(sql(as(ids.member, account, `select count(*) from public.certificates where id='${certificate}'`)).out, "1");
  assert.equal(sql(as(ids.member, account, "select public.cv_subscription_status()->>'entitled'")).out, "true");
  assert.equal(sql(as(ids.member, otherAccount, "select count(*) from public.accounts")).out, "0");
});
test("invalid Auth recipients cannot consume invitations even without selected membership", () => {
  const token = "a".repeat(64);
  sql(as(ids.owner, account, `select public.cv_prepare_invitation('other@example.test','${token}')`));
  for (const state of invalidStates) {
    sql(`update auth.users set ${state} where id='${ids.other}'`);
    assert.notEqual(sql(as(ids.other, null, `select public.cv_accept_invitation('${token}')`), false).status, 0);
    assert.equal(sql(`select status from public.account_invitations where token_hash='${token}'`).out, "pending");
    restore(ids.other);
  }
  assert.equal(sql(as(ids.other, null, `select public.cv_accept_invitation('${token}')`)).out, account);
});
test("organization suspension preserves billing/account discovery for an active confirmed identity", () => {
  sql(as(ids.owner, null, `select public.cv_platform_set_account_access('${account}','suspended','Synthetic integration security check',0)`, "aal2"));
  assert.equal(sql(as(ids.owner, account, "select public.cv_subscription_status()->>'entitled'")).out, "false");
  assert.equal(sql(as(ids.owner, null, "select count(*) from public.cv_list_accounts()")).out, "1");
  assert.notEqual(sql(as(ids.member, account, "select public.cv_generate_certificate_id()"), false).status, 0);
});
test("public certificate verification/catalog remain available despite Auth or account suspension", () => {
  sql(`update auth.users set banned_until=now()+interval '1 day' where id='${ids.member}'`);
  const result = JSON.parse(sql(`set role anon;select public.cv_public_certificate(${quote(reference)})`).out);
  assert.equal(result.status, "Active");
  assert.equal(sql("set role anon;select jsonb_array_length(public.cv_pricing_catalog())").out, "1");
  assert.equal(sql("select has_function_privilege('anon','public.cv_auth_identity_active()','EXECUTE')").out, "f");
  assert.equal(sql("select has_function_privilege('service_role','public.cv_auth_identity_active()','EXECUTE')").out, "f");
  assert.equal(sql("select has_function_privilege('authenticated','public.cv_auth_identity_active()','EXECUTE')").out, "t");
});
