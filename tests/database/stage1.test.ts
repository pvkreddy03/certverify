import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createDatabaseHarness } from "./harness";

const { start, close, sql, concurrentSql, as, ids, reserve, accept, hash } = createDatabaseHarness();
before(start);
after(close);

test("membership discovery lists both organizations without relying on oldest membership", () => {
  assert.equal(sql(as(ids.member, null, "select count(*) from public.cv_list_accounts()")).out, "2");
});
test("selected organization isolates private certificates and shared templates", () => {
  assert.equal(sql(as(ids.member, ids.a, "select certificate_id from public.certificates")).out, "A-1");
  assert.equal(sql(as(ids.member, ids.b, "select certificate_id from public.certificates")).out, "B-1");
  assert.equal(sql(as(ids.member, ids.a, "select name from public.certificate_templates")).out, "Template A");
});
test("missing or forged organization context fails closed", () => {
  assert.equal(sql(as(ids.member, null, "select count(*) from public.certificates")).out, "0");
  assert.equal(sql(as(ids.other, ids.a, "select count(*) from public.certificate_templates")).out, "0");
  assert.equal(sql(as(ids.member, "invalid", "select count(*) from public.certificates")).out, "0");
});
test("members cannot modify templates or directly grant themselves privileges", () => {
  assert.equal(sql(as(ids.member, ids.a, `update public.certificate_templates set name='Unauthorized' returning id`)).out, "");
  assert.equal(sql(as(ids.member, ids.a, `update public.account_members set role='owner' where user_id='${ids.member}' returning id`)).out, "");
  assert.notEqual(sql(as(ids.member, ids.a, `select public.cv_manage_member((select id from public.account_members where user_id='${ids.admin}'),'member',false)`), false).status, 0);
});

test("administrators cannot grant admin roles or change the owner", () => {
  const memberId = sql(`select id from public.account_members where user_id='${ids.member}' and account_id='${ids.a}'`).out;
  const ownerId = sql(`select id from public.account_members where user_id='${ids.owner}' and account_id='${ids.a}'`).out;
  assert.notEqual(sql(as(ids.admin,ids.a,`select public.cv_manage_member('${memberId}','admin',false)`),false).status,0);
  assert.notEqual(sql(as(ids.admin,ids.a,`select public.cv_manage_member('${ownerId}',null,true)`),false).status,0);
});

test("cross-account template references cannot create certificates", () => {
  assert.notEqual(sql(as(ids.member,ids.a,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.member}','${ids.a}','forged','${ids.templateB}','Active')`),false).status,0);
});
test("an invitation is recipient-bound and can be accepted once", () => {
  reserve("recipient@example.test", 1);
  assert.notEqual(sql(accept(ids.other, 1), false).status, 0);
  assert.equal(sql(accept(ids.recipient, 1, "Invited Professional")).out, ids.a);
  assert.notEqual(sql(accept(ids.recipient, 1), false).status, 0);
  assert.equal(sql(`select count(*) from public.account_members where account_id='${ids.a}' and user_id='${ids.recipient}'`).out, "1");
});
test("an existing user can join another organization without losing prior membership", () => {
  reserve("recipient@example.test", 2, undefined, ids.b);
  sql(accept(ids.recipient, 2));
  assert.equal(sql(as(ids.recipient, null, "select count(*) from public.cv_list_accounts()")).out, "2");
});
test("unconfirmed email cannot accept even when authenticated", () => {
  reserve("unconfirmed@example.test", 3);
  assert.notEqual(sql(accept(ids.unconfirmed, 3), false).status, 0);
});
test("expiry and cancellation prevent acceptance", () => {
  const id = reserve("other@example.test", 4);
  sql(`update public.account_invitations set expires_at=now()-interval '1 second' where id='${id}'`);
  assert.notEqual(sql(accept(ids.other, 4), false).status, 0);
  const fresh = reserve("other@example.test", 5);
  sql(as(ids.owner, ids.a, `select public.cv_revoke_invitation('${fresh}')`));
  assert.notEqual(sql(accept(ids.other, 5), false).status, 0);
});
test("resend replaces tokens and cannot target another organization", () => {
  const previous = reserve("other@example.test", 6);
  assert.notEqual(sql(as(ids.owner, ids.b, `select public.cv_prepare_invitation('other@example.test','${hash(7)}','${previous}')`), false).status, 0);
  reserve("other@example.test", 7, previous);
  assert.notEqual(sql(accept(ids.other, 6), false).status, 0);
  sql(accept(ids.other, 7));
});
test("simultaneous duplicate reservations create exactly one pending invitation", async () => {
  const statements = [8,9].map((n) => as(ids.owner, ids.a, `select public.cv_prepare_invitation('race@example.test','${hash(n)}')`));
  const results = await Promise.all(statements.map(concurrentSql));
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(sql("select count(*) from public.account_invitations where invited_email='race@example.test' and status='pending'").out, "1");
});
test("simultaneous acceptance creates one membership and one acceptance audit event", async () => {
  sql(`insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-0000-0000-000000000007','race@example.test',now())`);
  const n = Number.parseInt(sql("select token_hash from public.account_invitations where invited_email='race@example.test'").out,16);
  const results = await Promise.all([concurrentSql(accept("00000000-0000-0000-0000-000000000007", n, "Concurrent User")),concurrentSql(accept("00000000-0000-0000-0000-000000000007", n, "Concurrent User"))]);
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(sql("select count(*) from public.cv_audit_events where action='invitation.accepted' and actor_id='00000000-0000-0000-0000-000000000007'").out,"1");
});
test("removal immediately denies access to the member's own historical records", () => {
  const memberId = sql(`select id from public.account_members where account_id='${ids.a}' and user_id='${ids.member}'`).out;
  sql(as(ids.owner, ids.a, `select public.cv_manage_member('${memberId}',null,true)`));
  assert.equal(sql(as(ids.member, ids.a, "select count(*) from public.certificates")).out, "0");
  assert.equal(sql(as(ids.member, ids.b, "select count(*) from public.certificates")).out, "1");
  assert.equal(sql("select count(*) from public.certificates where certificate_id='A-1'").out, "1");
});
test("removed administrators return as members when reinvited", () => {
  const adminId = sql(`select id from public.account_members where account_id='${ids.a}' and user_id='${ids.admin}'`).out;
  sql(as(ids.owner, ids.a, `select public.cv_manage_member('${adminId}',null,true)`));
  reserve("admin@example.test",10);
  sql(accept(ids.admin,10));
  assert.equal(sql(`select role from public.account_members where id='${adminId}'`).out,"member");
});
test("owners cannot be removed through member controls and audit rows cannot be edited", () => {
  const ownerId = sql(`select id from public.account_members where account_id='${ids.a}' and user_id='${ids.owner}'`).out;
  assert.notEqual(sql(as(ids.owner, ids.a, `select public.cv_manage_member('${ownerId}',null,true)`),false).status,0);
  assert.notEqual(sql(as(ids.owner, ids.a,"delete from public.cv_audit_events"),false).status,0);
});
test("legacy certificate ID RPC is not callable directly", () => {
  assert.notEqual(sql(as(ids.owner, ids.a, `select public.generate_certificate_id('${ids.b}')`),false).status,0);
  assert.equal(sql(as(ids.owner, ids.a,"select public.cv_generate_certificate_id()")).out,ids.a);
});

test("new-user invitations require completed name and Auth password setup", () => {
  reserve("new@example.test", 11);
  const user = "00000000-0000-0000-0000-000000000008";
  sql(`insert into auth.users(id,email,email_confirmed_at,encrypted_password) values('${user}','new@example.test',now(),'')`);
  assert.notEqual(sql(accept(user,11,"New Professional"),false).status,0);
  sql(`update auth.users set encrypted_password='synthetic-test-password' where id='${user}'`);
  assert.notEqual(sql(accept(user,11),false).status,0);
  assert.equal(sql(accept(user,11,"New Professional")).out,ids.a);
});

test("acceptance racing resend cannot accept both the old and new tokens", async () => {
  const user = "00000000-0000-0000-0000-000000000009";
  sql(`insert into auth.users(id,email,email_confirmed_at) values('${user}','accept-race@example.test',now())`);
  const previous = reserve("accept-race@example.test",12);
  const results = await Promise.all([
    concurrentSql(accept(user,12)),
    concurrentSql(as(ids.owner,ids.a,`select public.cv_prepare_invitation('accept-race@example.test','${hash(13)}','${previous}')`)),
  ]);
  assert.equal(results.filter((result) => result.status === 0).length,1);
  const acceptedOld = sql(`select status from public.account_invitations where id='${previous}'`).out === "accepted";
  if (acceptedOld) assert.notEqual(sql(accept(user,13),false).status,0);
  else { assert.notEqual(sql(accept(user,12),false).status,0); sql(accept(user,13)); }
  assert.equal(sql(`select count(*) from public.account_members where account_id='${ids.a}' and user_id='${user}'`).out,"1");
});

test("existing-user invitations bind to the original Auth identity as well as email", () => {
  reserve("other@example.test",14,undefined,ids.b);
  const duplicate = "00000000-0000-0000-0000-000000000010";
  sql(`insert into auth.users(id,email,email_confirmed_at) values('${duplicate}','other@example.test',now())`);
  assert.notEqual(sql(accept(duplicate,14),false).status,0);
  assert.equal(sql(accept(ids.other,14)).out,ids.b);
});
