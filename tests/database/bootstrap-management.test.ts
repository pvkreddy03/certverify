import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabaseHarness } from "./harness";

const { start, close, sql, as, ids, concurrentSql } = createDatabaseHarness({ freshStaging: true });
const source = readFileSync("supabase/operations/sandbox-owner-bootstrap-management.sql", "utf8");
function bootstrap(user = ids.owner) {
  return source.replaceAll("OWNER_UUID_APPROVAL_REQUIRED", user)
    .replace("'APPROVAL_REFERENCE_REQUIRED'", "'fixture-operator-recorded-approval'");
}
before(async () => {
  await start();
  // Managed Auth/TOTP schema substitutes, never genuine hosted MFA verification.
  sql(`alter table auth.users add column banned_until timestamptz,add column deleted_at timestamptz,add column is_anonymous boolean default false;
    create table auth.mfa_factors(user_id uuid,factor_type text,status text);
    insert into auth.users(id,email,email_confirmed_at) values
      ('${ids.owner}','owner@example.test',now()),
      ('${ids.member}','member@example.test',now()),
      ('${ids.unconfirmed}','pending@example.test',null);
    insert into auth.mfa_factors values('${ids.owner}','totp','verified');`);
});
after(close);

test("plain SQL bootstrap rejects untouched placeholders and performs no grant", () => {
  assert.ok(!/^\\/m.test(source));
  assert.notEqual(sql(source, false).status, 0);
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
});
test("management bootstrap rejects protected or unapproved project identity", () => {
  for (const project of ["jhnxztaqfikgvkshifel", "abcdefghijklmnopqrst"]) {
    // Replace only the operator input; keep the independent allowlist intact.
    const attempt = bootstrap().replace("'fixture-operator-recorded-approval','nubohxesjeaodqcveiud'", `'fixture-operator-recorded-approval','${project}'`);
    assert.notEqual(sql(attempt, false).status, 0);
  }
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
});
test("management bootstrap requires confirmed owner and verified TOTP", () => {
  for (const user of [ids.unconfirmed, ids.member]) assert.notEqual(sql(bootstrap(user), false).status, 0);
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
});
test("management bootstrap rejects banned, deleted or anonymous owner accounts", () => {
  for (const state of ["banned_until=now()+interval '1 day'", "deleted_at=now()", "is_anonymous=true"]) {
    sql(`update auth.users set ${state} where id='${ids.owner}'`);
    assert.notEqual(sql(bootstrap(), false).status, 0);
    sql(`update auth.users set banned_until=null,deleted_at=null,is_anonymous=false where id='${ids.owner}'`);
  }
});
test("ordinary AAL2 authenticated users cannot execute the privileged operator procedure", () => {
  const body = bootstrap().replace(/^begin;/m, "").replace(/^commit;/m, "");
  assert.notEqual(sql(as(ids.owner, null, body, "aal2"), false).status, 0);
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
});
test("failed bootstrap audit insertion rolls back the administrator grant", () => {
  sql(`create function public.test_reject_bootstrap_audit() returns trigger language plpgsql as $$begin raise exception 'Synthetic audit failure';end$$;
    create trigger test_reject_bootstrap_audit before insert on public.cv_platform_audit_events for each row execute function public.test_reject_bootstrap_audit();`);
  assert.notEqual(sql(bootstrap(), false).status, 0);
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "0");
  sql("drop trigger test_reject_bootstrap_audit on public.cv_platform_audit_events;drop function public.test_reject_bootstrap_audit()");
});
test("concurrent management bootstraps create exactly one grant and immutable approval audit", async () => {
  const results = await Promise.all([concurrentSql(bootstrap()), concurrentSql(bootstrap())]);
  assert.equal(results.filter(r => r.status === 0).length, 1);
  assert.equal(sql("select count(*) from public.cv_platform_admins").out, "1");
  assert.equal(sql("select count(*) from public.cv_platform_audit_events where action='platform.sandbox_owner_bootstrapped'").out, "1");
  const audit = JSON.parse(sql("select details from public.cv_platform_audit_events where action='platform.sandbox_owner_bootstrapped'").out);
  assert.equal(audit.approval_reference, "fixture-operator-recorded-approval");
  assert.equal(audit.sandbox_project_ref, "nubohxesjeaodqcveiud");
  assert.equal(audit.actor_is_grant_recipient, true);
  assert.equal(audit.granted_by_external_operator, true);
  assert.notEqual(sql("update public.cv_platform_audit_events set details='{}'::jsonb", false).status, 0);
});
