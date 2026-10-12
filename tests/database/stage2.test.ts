import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabaseHarness } from "./harness";

const { start, close, sql, concurrentSql, as, ids, quote } = createDatabaseHarness();
let certificate: string, second: string;
before(async () => {
  await start();
  certificate = sql("select id from public.certificates where certificate_id='A-1'").out;
  sql(`insert into public.certificate_field_values(certificate_id,field_name,field_type,field_value,is_public,display_order) values
    ('${certificate}','Public title','text','Public record',true,1),('${certificate}','Private client','text','CONFIDENTIAL-FIELD',false,2);
    insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values
    ('${ids.member}','${ids.a}','A-2','${ids.templateA}','Active');`);
  second = sql("select id from public.certificates where certificate_id='A-2'").out;
  sql(readFileSync("supabase/proposals/20261012_stage2_certificate_revocation.sql", "utf8"));
});
after(close);
function change(user: string, id: string, status: string, reason: string | null = null, publicReason: string | null = null, account = ids.a) {
  return as(user, account, `select public.cv_change_certificate_status('${id}',${quote(status)},${reason === null ? "null" : quote(reason)},${publicReason === null ? "null" : quote(publicReason)})`);
}
function publicLookup(reference: string) {
  return `begin read only; set local role anon; select public.cv_public_certificate(${quote(reference)}); commit;`;
}
test("members, outsiders and cross-organization administrators cannot revoke", () => {
  assert.notEqual(sql(change(ids.member,certificate,"Revoked","reason"),false).status,0);
  assert.notEqual(sql(change(ids.other,certificate,"Revoked","reason"),false).status,0);
  assert.notEqual(sql(change(ids.owner,certificate,"Revoked","reason",null,ids.b),false).status,0);
  assert.notEqual(sql(`set role anon; select public.cv_change_certificate_status('${certificate}','Revoked','reason',null)`,false).status,0);
});
test("mandatory reason and maximum lengths are checked by PostgreSQL", () => {
  assert.notEqual(sql(change(ids.owner,certificate,"Revoked","   "),false).status,0);
  assert.notEqual(sql(change(ids.owner,certificate,"Revoked","r".repeat(2001)),false).status,0);
  assert.notEqual(sql(change(ids.owner,certificate,"Revoked","reason","p".repeat(501)),false).status,0);
  assert.equal(sql(`select status from public.certificates where id='${certificate}'`).out,"Active");
});
test("revocation records reason, actor, account, time, previous status and one audit", () => {
  sql(change(ids.owner,certificate,"Revoked","CONFIDENTIAL-INTERNAL-REASON","Withdrawn by issuer"));
  const evidence = JSON.parse(sql(`select jsonb_build_object('status',status,'actor',revoked_by,'account',revoked_account_id,'previous',revocation_previous_status,'reason',revocation_reason,'time',revoked_at) from public.certificates where id='${certificate}'`).out);
  assert.equal(evidence.status,"Revoked"); assert.equal(evidence.actor,ids.owner); assert.equal(evidence.account,ids.a);
  assert.equal(evidence.previous,"Active"); assert.equal(evidence.reason,"CONFIDENTIAL-INTERNAL-REASON"); assert.ok(evidence.time);
  assert.equal(sql(`select count(*) from public.cv_audit_events where action='certificate.revoked' and subject_id='${certificate}'`).out,"1");
});
test("public revoked lookup is read-only and exposes only approved explanation and fields", () => {
  const result = JSON.parse(sql(publicLookup("A-1")).out);
  assert.equal(result.status,"Revoked"); assert.equal(result.issuer_name,"Account A");
  assert.equal(result.public_revocation_reason,"Withdrawn by issuer"); assert.equal(result.fields.length,1);
  const text = JSON.stringify(result);
  for (const secret of ["CONFIDENTIAL-INTERNAL-REASON","CONFIDENTIAL-FIELD",ids.owner,ids.member,ids.a]) assert.equal(text.includes(secret),false);
  assert.equal(sql(`select count(*) from public.certificate_verifications`).out,"0");
  assert.notEqual(sql("set role anon; select * from public.certificates",false).status,0);
  assert.notEqual(sql("set role anon; select * from public.certificate_field_values",false).status,0);
});
test("idempotent retries preserve original evidence and cannot reactivate or delete", () => {
  const before = sql(`select row_to_json(c)::text from public.certificates c where id='${certificate}'`).out;
  sql(change(ids.admin,certificate,"Revoked","Changed reason","Changed public reason"));
  assert.equal(sql(`select row_to_json(c)::text from public.certificates c where id='${certificate}'`).out,before);
  assert.notEqual(sql(change(ids.owner,certificate,"Active"),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,`update public.certificates set status='Active' where id='${certificate}'`),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,`delete from public.certificates where id='${certificate}'`),false).status,0);
  assert.notEqual(sql(`delete from public.certificates where id='${certificate}'`,false).status,0);
});
test("revoked fields cannot be changed, removed or appended", () => {
  assert.equal(sql(as(ids.member,ids.a,`update public.certificate_field_values set field_value='tampered' where certificate_id='${certificate}' returning id`)).out,"");
  assert.equal(sql(as(ids.member,ids.a,`delete from public.certificate_field_values where certificate_id='${certificate}' returning id`)).out,"");
  assert.notEqual(sql(as(ids.member,ids.a,`insert into public.certificate_field_values(certificate_id,field_name,field_type,is_public,display_order) values('${certificate}','Extra','text',true,3)`),false).status,0);
});
test("Inactive is publicly identifiable and can be restored by an administrator", () => {
  sql(change(ids.admin,second,"Inactive","Temporary review"));
  assert.equal(JSON.parse(sql(publicLookup("A-2")).out).status,"Inactive");
  sql(change(ids.admin,second,"Active","Review complete"));
  assert.equal(JSON.parse(sql(publicLookup("A-2")).out).status,"Active");
});
test("concurrent revocations commit one immutable record and one audit event", async () => {
  const results = await Promise.all([concurrentSql(change(ids.owner,second,"Revoked","Owner reason")),concurrentSql(change(ids.admin,second,"Revoked","Admin reason"))]);
  assert.equal(results.filter((result) => result.status === 0).length,2);
  assert.equal(sql(`select count(*) from public.cv_audit_events where action='certificate.revoked' and subject_id='${second}'`).out,"1");
  const evidence = JSON.parse(sql(`select jsonb_build_object('reason',revocation_reason,'actor',revoked_by) from public.certificates where id='${second}'`).out);
  assert.equal(evidence.reason === "Owner reason" ? evidence.actor === ids.owner : evidence.actor === ids.admin,true);
});
test("newly issued certificates cannot bypass evidence by starting Revoked", () => {
  assert.notEqual(sql(as(ids.member,ids.a,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.member}','${ids.a}','forged-revoked','${ids.templateA}','Revoked')`),false).status,0);
});
test("replacements link to the same-account revoked original without changing its history", () => {
  const replacement = sql(as(ids.member,ids.a,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status,replaces_certificate_id) values('${ids.member}','${ids.a}','A-replacement','${ids.templateA}','Active','${certificate}') returning id`)).out;
  assert.equal(sql(`select replaces_certificate_id from public.certificates where id='${replacement}'`).out,certificate);
  assert.notEqual(sql(as(ids.member,ids.b,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status,replaces_certificate_id) values('${ids.member}','${ids.b}','cross-replacement','${ids.templateB}','Active','${certificate}')`),false).status,0);
  assert.equal(sql(`select status from public.certificates where id='${certificate}'`).out,"Revoked");
});
test("canonical public identifiers are unique; ambiguous legacy labels fail closed", () => {
  // First assert the real snapshot's global unique index is retained.
  assert.notEqual(sql(as(ids.owner,ids.b,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.owner}','${ids.b}','A-1','${ids.templateB}','Active')`),false).status,0);
  // Model a degraded historical schema only in this disposable fixture to verify
  // fail-closed behavior; the application proposal never drops this index.
  sql("drop index public.certificates_certificate_id_unique");
  sql(as(ids.owner,ids.b,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.owner}','${ids.b}','A-1','${ids.templateB}','Active')`));
  assert.equal(sql(publicLookup("A-1")).out,"");
  const publicId = sql(`select public_verification_id from public.certificates where id='${certificate}'`).out;
  assert.equal(JSON.parse(sql(publicLookup(publicId)).out).status,"Revoked");
  assert.equal(sql("select count(*)=count(distinct public_verification_id) from public.certificates").out,"t");
});

test("field edits racing revocation are serialized and no edits are possible afterward",async () => {
  const id=sql(as(ids.member,ids.a,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.member}','${ids.a}','race-fields','${ids.templateA}','Active') returning id`)).out;
  sql(as(ids.member,ids.a,`insert into public.certificate_field_values(certificate_id,field_name,field_type,field_value,is_public,display_order) values('${id}','Evidence','text','Original',true,1)`));
  const results=await Promise.all([
    concurrentSql(as(ids.member,ids.a,`update public.certificate_field_values set field_value='Before revocation' where certificate_id='${id}'; select pg_sleep(0.1)`)),
    concurrentSql(change(ids.owner,id,"Revoked","Withdrawn")),
  ]);
  assert.equal(results[1].status,0);
  const final=sql(`select field_value from public.certificate_field_values where certificate_id='${id}'`).out;
  assert.ok(["Original","Before revocation"].includes(final));
  assert.equal(sql(as(ids.member,ids.a,`update public.certificate_field_values set field_value='After revocation' where certificate_id='${id}' returning id`)).out,"");
  assert.equal(sql(`select field_value from public.certificate_field_values where certificate_id='${id}'`).out,final);
});

test("the prepared schema inspection runs read-only against the isolated schema",() => {
  const before=sql("select count(*) from public.certificates").out;
  const result=sql(readFileSync("supabase/inspection/stage1-readonly.sql","utf8"));
  assert.equal(result.out.split("\n")[0],"on");
  assert.equal(sql("select count(*) from public.certificates").out,before);
});

test("new issuance timestamps are database-owned rather than client-supplied",() => {
  const created=sql(as(ids.member,ids.a,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status,created_at) values('${ids.member}','${ids.a}','timestamp-test','${ids.templateA}','Active','1900-01-01') returning extract(year from created_at)>2000`)).out;
  assert.equal(created,"t");
});
