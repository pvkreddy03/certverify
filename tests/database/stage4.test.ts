import { before,after,test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabaseHarness } from "./harness";
const {start,close,sql,as,ids,quote,reserve,accept,concurrentSql}=createDatabaseHarness();
const individual="10000000-0000-0000-0000-000000000003";
before(async()=>{
  await start();sql(readFileSync("supabase/proposals/20261012_stage2_certificate_revocation.sql","utf8"));
  sql(`create role service_role bypassrls;create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated;create policy legacy_storage on storage.objects for all to anon,authenticated using(true) with check(true);`);
  sql(readFileSync("supabase/proposals/20261012_stage3_branding.sql","utf8"));
  sql(readFileSync("supabase/proposals/20261012_stage4_platform_admin.sql","utf8"));
  sql(`insert into public.cv_platform_admins(user_id) values('${ids.other}');
    insert into public.accounts(id,account_name,account_code,account_type) values('${individual}','Solo Professional','SOLO','individual');
    insert into public.account_members(account_id,user_id,role,status) values('${individual}','${ids.owner}','owner','active');`);
});
after(close);
function platform(statement:string,aal="aal2",user=ids.other){return as(user,null,statement,aal);}
function revision(account=ids.a){return Number(sql(`select revision from public.cv_account_access where account_id='${account}'`).out);}
function change(status:string,account=ids.a,reason="Administrative review"){return sql(platform(`select public.cv_platform_set_account_access('${account}',${quote(status)},${quote(reason)},${revision(account)})`));}
function json(statement:string){const out=sql(platform(statement)).out;return out ? JSON.parse(out) : null;}
function issue(label:string,account=ids.a,template=ids.templateA){return as(ids.member,account,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.member}','${account}',${quote(label)},'${template}','Active') returning id`);}
test("owners/admins cannot acquire platform rights through metadata, raw writes or report calls",()=>{
  sql(`update auth.users set raw_user_meta_data='{"super_admin":true}' where id='${ids.owner}'`);
  for(const user of [ids.owner,ids.admin,ids.member]){
    assert.equal(sql(as(user,ids.a,"select public.cv_is_platform_admin()","aal2")).out,"f");
    for(const call of ["select public.cv_platform_overview()","select public.cv_platform_accounts()",`select public.cv_platform_account('${ids.a}')`,`select public.cv_platform_set_account_access('${ids.a}','suspended','Reason',0)`,"select public.cv_platform_audit()"])
      assert.notEqual(sql(as(user,ids.a,call,"aal2"),false).status,0);
    assert.notEqual(sql(as(user,ids.a,`insert into public.cv_platform_admins(user_id) values('${user}')`),false).status,0);
  }
});
test("MFA, confirmed email and active platform permission are enforced in every reporting RPC",()=>{
  for(const call of ["select public.cv_platform_overview()","select public.cv_platform_accounts()",`select public.cv_platform_account('${ids.a}')`,"select public.cv_platform_audit()"])
    assert.notEqual(sql(platform(call,"aal1"),false).status,0);
  sql(`insert into public.cv_platform_admins(user_id) values('${ids.unconfirmed}')`);
  assert.notEqual(sql(platform("select public.cv_platform_overview()","aal2",ids.unconfirmed),false).status,0);
  sql(`update public.cv_platform_admins set active=false where user_id='${ids.other}'`);
  assert.notEqual(sql(platform("select public.cv_platform_accounts()"),false).status,0);
  sql(`update public.cv_platform_admins set active=true where user_id='${ids.other}'`);
});
test("overview distinguishes registered users, account types, certificate statuses and unavailable subscriptions",()=>{
  const report=json("select public.cv_platform_overview(7)");
  assert.equal(report.accounts,3);assert.equal(report.individual_accounts,1);assert.equal(report.organization_accounts,2);assert.equal(report.users,6);
  assert.equal(report.certificates,2);assert.equal(report.active_certificates,2);assert.deepEqual(report.subscription_statuses,{unknown:3});assert.equal(report.issuance_daily.length,7);
  assert.notEqual(sql(platform("select public.cv_platform_overview(91)"),false).status,0);
});
test("search/filter/pagination use approved identity and literal search rather than wildcards",()=>{
  assert.equal(json("select public.cv_platform_accounts('Solo','individual',null,'unknown',1,25)").total,1);
  assert.equal(json("select public.cv_platform_accounts('owner@example.test')").total,3);
  assert.equal(json("select public.cv_platform_accounts('%')").total,0);
  const first=json("select public.cv_platform_accounts('',null,null,null,1,1)");const second=json("select public.cv_platform_accounts('',null,null,null,2,1)");
  assert.equal(first.total,3);assert.notEqual(first.accounts[0].id,second.accounts[0].id);
  for(const call of ["select public.cv_platform_accounts('',null,null,null,0,25)","select public.cv_platform_accounts('',null,null,null,1,51)","select public.cv_platform_accounts('',null,'deleted')"])
    assert.notEqual(sql(platform(call),false).status,0);
});
let certificate:string;
test("account inspection returns scoped memberships and statistics without private certificate or auth contents",()=>{
  certificate=sql(issue("stage4-private")).out;
  sql(as(ids.member,ids.a,`insert into public.certificate_field_values(certificate_id,field_name,field_type,field_value,is_public) values('${certificate}','Private secret','text','SECRET-CONTENT',false)`));
  sql(as(ids.owner,ids.a,`select public.cv_change_certificate_status('${certificate}','Revoked','CONFIDENTIAL-REASON','Withdrawn')`));
  const detail=json(`select public.cv_platform_account('${ids.a}')`);const serialized=JSON.stringify(detail);
  assert.equal(detail.account.certificate_count,2);assert.equal(detail.account.revoked_certificates,1);assert.equal(detail.total_members,3);
  assert.ok(detail.members.every((m:{email:string})=>!m.email.includes("other@")));
  for(const secret of ["SECRET-CONTENT","CONFIDENTIAL-REASON","encrypted_password","raw_user_meta_data","field_value","revocation_reason"])assert.ok(!serialized.includes(secret));
  assert.equal(json("select public.cv_platform_account('99999999-0000-0000-0000-000000000000')"),null);
});
test("subscription summaries are informational, sourced and never writable by customers",()=>{
  sql(`insert into public.cv_subscription_summaries(account_id,status,source) values('${individual}','trial','isolated-test-import')`);
  assert.equal(json("select public.cv_platform_overview()").subscription_statuses.trial,1);
  assert.equal(json("select public.cv_platform_accounts('',null,null,'trial')").total,1);
  assert.equal(json(`select public.cv_platform_account('${individual}')`).subscription.source,"isolated-test-import");
  assert.notEqual(sql(as(ids.owner,individual,`update public.cv_subscription_summaries set status='active'`),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,`update public.cv_account_access set status='active'`),false).status,0);
});
let invitation:string;
test("suspension requires a reason and expected revision and appends one immutable decision",()=>{
  invitation=reserve("recipient@example.test",40);
  const count=sql("select count(*) from public.cv_platform_audit_events where action='account.access_changed'").out;
  for(const reason of ["", "   "])
    assert.notEqual(sql(platform(`select public.cv_platform_set_account_access('${ids.a}','suspended',${quote(reason)},0)`),false).status,0);
  assert.equal(sql("select count(*) from public.cv_platform_audit_events where action='account.access_changed'").out,count);
  change("suspended",ids.a,"Security review required");assert.equal(revision(),1);
  change("suspended");assert.equal(revision(),1);
  assert.equal(sql("select count(*) from public.cv_platform_audit_events where action='account.access_changed'").out,"1");
  assert.notEqual(sql(platform(`select public.cv_platform_set_account_access('${ids.a}','active','Restore',0)`),false).status,0);
});
test("suspension blocks customer data, issuance, templates, invitations, branding and private logos while retaining memberships",()=>{
  assert.equal(sql(as(ids.owner,ids.a,"select public.cv_selected_account()")).out,"");
  assert.equal(sql(as(ids.member,ids.a,"select count(*) from public.certificates")).out,"0");
  assert.notEqual(sql(issue("suspended-issue"),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,`insert into public.certificate_templates(user_id,account_id,name) values('${ids.owner}','${ids.a}','Suspended template')`),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,"select public.cv_reserve_logo()"),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,"select public.cv_request_branding('Unapproved','',null,'')"),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,"select public.cv_generate_certificate_id()"),false).status,0);
  assert.notEqual(sql(accept(ids.recipient,40),false).status,0);
  assert.equal(sql(`select status from public.account_invitations where id='${invitation}'`).out,"pending");
  assert.equal(sql(`select count(*) from public.account_members where account_id='${ids.a}' and status='active'`).out,"3");
  assert.equal(sql(as(ids.member,ids.b,"select count(*) from public.certificates")).out,"1");
  const states=JSON.parse(sql(as(ids.member,null,"select public.cv_customer_account_states()")).out);
  assert.deepEqual(new Set(states.map((s:{account_id:string})=>s.account_id)),new Set([ids.a,ids.b]));
  assert.ok(states.some((s:{status:string})=>s.status==="suspended"));
});
test("public certificate status and historical issuer identity survive suspension and restoration",()=>{
  const record=JSON.parse(sql(`set role anon;select public.cv_public_certificate('stage4-private')`).out);
  assert.equal(record.status,"Revoked");assert.equal(record.issuer_name,"Account A");assert.equal(record.public_revocation_reason,"Withdrawn");
  change("active",ids.a,"Review completed");
  assert.equal(sql(as(ids.member,ids.a,"select count(*) from public.certificates")).out,"2");
  sql(accept(ids.recipient,40));assert.equal(sql(`select status from public.account_invitations where id='${invitation}'`).out,"accepted");
  const restored=JSON.parse(sql(`set role anon;select public.cv_public_certificate('stage4-private')`).out);assert.deepEqual(restored,record);
});
test("deactivation and activation preserve historical records and require platform authority",()=>{
  change("inactive",individual,"Account pending verification");
  assert.equal(sql(as(ids.owner,individual,"select public.cv_selected_account()")).out,"");
  assert.notEqual(sql(as(ids.owner,individual,"select public.cv_upgrade_account()"),false).status,0);
  change("active",individual,"Account verified");sql(as(ids.owner,individual,"select public.cv_upgrade_account()"));
  assert.equal(sql(`select account_type from public.accounts where id='${individual}'`).out,"organization");
});
test("platform reporting does not grant raw cross-tenant data access or internal helper execution",()=>{
  assert.equal(sql(platform("select count(*) from public.certificates")).out,"0");
  for(const call of ["select * from public.cv_account_access","select * from public.cv_subscription_summaries","select * from public.cv_platform_admins","select * from public.cv_platform_audit_events","select * from public.cv_platform_account_rows()","select public.cv_require_platform_admin()"])
    assert.notEqual(sql(platform(call),false).status,0);
  assert.notEqual(sql("set role anon;select public.cv_platform_overview()",false).status,0);
});
test("concurrent access decisions fail stale revisions and preserve a single audit transition",async()=>{
  const version=revision();const before=Number(sql("select count(*) from public.cv_platform_audit_events where action='account.access_changed'").out);
  const results=await Promise.all([concurrentSql(platform(`select public.cv_platform_set_account_access('${ids.a}','suspended','Concurrent suspension',${version})`)),concurrentSql(platform(`select public.cv_platform_set_account_access('${ids.a}','inactive','Concurrent deactivation',${version})`))]);
  assert.equal(results.filter((r)=>r.status===0).length,1);assert.equal(revision(),version+1);
  assert.equal(Number(sql("select count(*) from public.cv_platform_audit_events where action='account.access_changed'").out),before+1);change("active");
});
test("issuance versus suspension serializes and cannot commit an unauthorized certificate after disabled state",async()=>{
  const version=revision();
  const results=await Promise.all([concurrentSql(platform(`select public.cv_platform_set_account_access('${ids.a}','suspended','Issuance race',${version})`)),concurrentSql(issue("stage4-race"))]);
  assert.equal(results[0].status,0);
  const count=Number(sql("select count(*) from public.certificates where certificate_id='stage4-race'").out);
  assert.equal(count,results[1].status===0 ? 1 : 0);
  assert.notEqual(sql(issue("post-suspension"),false).status,0);change("active");
});
test("Stage 3 approval and scoped permission revocation remain available to authorized platform administrators",()=>{
  const request=sql(as(ids.owner,ids.a,"select public.cv_request_branding('Stage Four Brand','',null,'Verified request')")).out;
  sql(platform(`select public.cv_review_branding('${request}','grant',null,'${ids.member}',array['company_name'],now()+interval '1 hour')`));
  const permission=sql(`select id from public.cv_branding_permissions where request_id='${request}'`).out;
  change("suspended");assert.notEqual(sql(as(ids.member,ids.a,`select public.cv_apply_branding_permission('${permission}')`),false).status,0);
  sql(platform(`select public.cv_revoke_branding_permission('${permission}')`));sql(platform(`select public.cv_review_branding('${request}','approve')`));
  assert.equal(json(`select public.cv_platform_account('${ids.a}')`).account.name,"Stage Four Brand");
  const historical=JSON.parse(sql("set role anon;select public.cv_public_certificate('stage4-private')").out);assert.equal(historical.issuer_name,"Account A");change("active");
});
test("administrative and customer audit evidence is immutable and browse access is itself audited",()=>{
  for(const table of ["cv_audit_events","cv_platform_audit_events"]){assert.notEqual(sql(`update public.${table} set action='tampered'`,false).status,0);assert.notEqual(sql(`delete from public.${table}`,false).status,0);}
  const before=Number(sql("select count(*) from public.cv_platform_audit_events where action='platform.audit_viewed'").out);
  const report=json(`select public.cv_platform_audit('${ids.a}',1)`);
  assert.ok(report.events.every((event:{account_id:string})=>event.account_id===ids.a));assert.ok(report.events.some((event:{action:string})=>event.action==="account.access_changed"));
  assert.equal(Number(sql("select count(*) from public.cv_platform_audit_events where action='platform.audit_viewed'").out),before+1);
});
test("bounded branding queue supports status filters, active recipient selection and MFA gating",()=>{
  const report=json("select public.cv_platform_branding_requests(null,1,1)");assert.equal(report.reviews.length,1);
  assert.equal(report.reviews[0].request.status,"approved");assert.ok(report.reviews[0].members.every((m:{email:string})=>m.email && !m.email.includes("other@")));
  assert.equal(json("select public.cv_platform_branding_requests('open')").total,0);
  for(const statement of ["select public.cv_platform_branding_requests('invalid')","select public.cv_platform_branding_requests(null,1,51)","select public.cv_platform_branding_queue()"])
    assert.notEqual(sql(platform(statement),false).status,0);
  assert.notEqual(sql(platform("select public.cv_platform_branding_requests()","aal1"),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,"select public.cv_platform_branding_requests()","aal2"),false).status,0);
});
test("suspension blocks trusted logo finalization without breaking immutable public logo evidence",()=>{
  const asset=JSON.parse(sql(as(ids.owner,ids.a,"select public.cv_reserve_logo()")).out);
  sql(`insert into storage.objects(bucket_id,name,metadata) values('certverify-branding','${asset.path}','{"mimetype":"image/webp","size":100}')`);
  change("suspended");
  const finalize=`begin;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';select public.cv_finalize_logo('${asset.id}','${"a".repeat(64)}',100);commit;`;
  assert.notEqual(sql(finalize,false).status,0);assert.equal(sql(`select state from public.cv_logo_assets where id='${asset.id}'`).out,"reserved");
  change("active");sql(finalize);
  const request=sql(as(ids.owner,ids.a,`select public.cv_request_branding('Stage Four Brand','', '${asset.id}','Approved logo')`)).out;sql(platform(`select public.cv_review_branding('${request}','approve')`));
  sql(issue("stage4-logo"));change("inactive");
  assert.equal(sql("set role anon;select public.cv_public_logo_path('stage4-logo')").out,asset.path);
  assert.equal(sql(as(ids.owner,ids.a,`select public.cv_logo_access('${asset.id}')`)).out,"");change("active");
});
test("read-only preflight and daily issuance totals are consistent with retained records",()=>{
  const before=sql("select count(*) from public.cv_platform_audit_events").out;sql(readFileSync("supabase/inspection/stage4-readonly.sql","utf8"));assert.equal(sql("select count(*) from public.cv_platform_audit_events").out,before);
  const report=json("select public.cv_platform_overview(30)");assert.equal(report.issuance_daily.reduce((total:number,day:{count:number})=>total+day.count,0),report.certificates);
});
