import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabaseHarness } from "./harness";
const { start, close, sql, as, ids, concurrentSql } = createDatabaseHarness();
const source = readFileSync("supabase/operations/sandbox-owner-bootstrap.sql", "utf8");
function bootstrap(user = ids.owner) {
  return source.replaceAll(":'owner_user_id'", `'${user}'`).replaceAll(":'approval_reference'", "'fixture-approved-sandbox-only'").replaceAll(":'sandbox_project_ref'", "'abcdefghijklmnopqrst'");
}
before(async () => {
  await start();
  // Minimal hosted Auth/administration substitutes: not a real TOTP verification.
  sql(`alter table auth.users add column banned_until timestamptz,add column deleted_at timestamptz,add column is_anonymous boolean default false;
    create table auth.mfa_factors(user_id uuid,factor_type text,status text);
    create table public.cv_platform_admins(user_id uuid primary key,granted_by uuid,active boolean default true);
    create table public.cv_platform_audit_events(actor_id uuid,action text,subject_id uuid,details jsonb);
    revoke all on public.cv_platform_admins,public.cv_platform_audit_events from authenticated,anon;
    insert into auth.mfa_factors values('${ids.owner}','totp','verified');`);
});
after(close);
test("unconfirmed or unenrolled users cannot be bootstrapped", () => {
  const sourceAttempt=sql(bootstrap().replace('abcdefghijklmnopqrst','jhnxztaqfikgvkshifel'),false);
  assert.notEqual(sourceAttempt.status,0);
  assert.ok(sourceAttempt.error.includes('Protected source project'));
  for (const user of [ids.unconfirmed, ids.member]) assert.notEqual(sql(bootstrap(user), false).status, 0);
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
});
test("banned, deleted and anonymous owners cannot be granted platform privilege", () => {
  for (const state of ["banned_until=now()+interval '1 day'", "deleted_at=now()", "is_anonymous=true"]) {
    sql(`update auth.users set ${state} where id='${ids.owner}'`);
    assert.notEqual(sql(bootstrap(), false).status, 0);
    sql(`update auth.users set banned_until=null,deleted_at=null,is_anonymous=false where id='${ids.owner}'`);
  }
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
});
test("public authenticated execution cannot self-grant bootstrap privileges", () => {
  const body = bootstrap().replace('\\set ON_ERROR_STOP on', '').replace(/^begin;/m, '').replace(/^commit;/m, '');
  assert.notEqual(sql(as(ids.owner, ids.a, body, "aal2"), false).status, 0);
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
});
test("concurrent first-admin grants produce exactly one grant and one audit", async () => {
  const results = await Promise.all([concurrentSql(bootstrap()), concurrentSql(bootstrap())]);
  assert.equal(results.filter(r => r.status === 0).length, 1);
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "1");
  const audit = JSON.parse(sql("select details from public.cv_platform_audit_events").out);
  assert.equal(audit.actor_is_grant_recipient, true);
  assert.equal(audit.granted_by_external_operator, true);
});
