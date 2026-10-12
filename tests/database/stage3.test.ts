import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabaseHarness } from "./harness";

const { start,close,sql,as,ids,quote,concurrentSql }=createDatabaseHarness();
before(async()=>{
  await start();sql(readFileSync("supabase/proposals/20261012_stage2_certificate_revocation.sql","utf8"));
  // Storage service/schema fixtures are explicit substitutes; no real bucket is created.
  sql(`create role service_role bypassrls; create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    create policy legacy_broad_storage on storage.objects for all to anon,authenticated using(true) with check(true);`);
  sql(readFileSync("supabase/proposals/20261012_stage3_branding.sql","utf8"));
  sql(`insert into public.cv_platform_admins(user_id,granted_by) values('${ids.other}','${ids.other}')`);
});
after(close);
function superAs(statement:string,aal="aal2") { return as(ids.other,null,statement,aal); }
function request(name:string,account=ids.a,logo?:string|null,details?:string) {
  const current=JSON.parse(sql(as(ids.owner,account,"select public.cv_current_branding()")).out);
  const selectedLogo=logo===undefined ? current.logo_asset_id : logo;
  return sql(as(ids.owner,account,`select public.cv_request_branding(${quote(name)},${quote(details ?? current.professional_details)},${selectedLogo ? quote(selectedLogo) : "null"},'Customer request')`)).out;
}
function approve(id:string) { sql(superAs(`select public.cv_review_branding('${id}','approve')`)); }
function reserve(account=ids.a) { return JSON.parse(sql(as(ids.owner,account,"select public.cv_reserve_logo()")).out) as { id:string;path:string }; }
function ready(asset:{id:string;path:string}) {
  sql(`insert into storage.objects(bucket_id,name,metadata) values('certverify-branding','${asset.path}','{"mimetype":"image/webp","size":100}')`);
  sql(`begin;set local role service_role;set local request.jwt.claims='{"role":"service_role"}';select public.cv_finalize_logo('${asset.id}','${"a".repeat(64)}',100);commit;`);
}
test("customer ownership never grants platform administration; MFA is mandatory",()=>{
  assert.equal(sql(as(ids.owner,ids.a,"select public.cv_platform_identity()","aal2")).out,"f");
  assert.equal(sql(superAs("select public.cv_is_platform_admin()","aal1")).out,"f");
  assert.equal(sql(superAs("select public.cv_is_platform_admin()")).out,"t");
  assert.notEqual(sql(as(ids.owner,ids.a,`insert into public.cv_platform_admins(user_id) values('${ids.owner}')`),false).status,0);
});
test("branding is tenant-scoped and members cannot directly edit or request changes",()=>{
  assert.equal(sql(as(ids.member,ids.a,"select count(*) from public.cv_branding_versions")).out,"1");
  assert.notEqual(sql(as(ids.member,ids.a,"select public.cv_request_branding('Unauthorized','',null, '')"),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,"update public.cv_branding_versions set company_name='Bypass'"),false).status,0);
  assert.equal(sql(as(ids.owner,ids.a,"update public.accounts set account_name='Bypass' returning id")).out,"");
  assert.notEqual(sql("update public.accounts set account_name='Bypass'",false).status,0);
});
let certificate:string;let oldVersion:string;let approvedLogo:{id:string;path:string};
test("new issuance snapshots the initial branding in the same transaction",()=>{
  oldVersion=JSON.parse(sql(as(ids.member,ids.a,"select public.cv_current_branding()")).out).id;
  certificate=sql(as(ids.member,ids.a,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.member}','${ids.a}','brand-original','${ids.templateA}','Active') returning id`)).out;
  assert.equal(sql(`select branding_version_id from public.cv_certificate_branding where certificate_id='${certificate}'`).out,oldVersion);
});
test("logo reservations are scoped; only the trusted service finalizes actual stored objects",()=>{
  approvedLogo=reserve();
  assert.ok(approvedLogo.path.startsWith(ids.a+"/"));
  assert.notEqual(sql(as(ids.owner,ids.a,`select public.cv_finalize_logo('${approvedLogo.id}','${"a".repeat(64)}',100)`),false).status,0);
  assert.notEqual(sql(`begin;set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.cv_finalize_logo('${approvedLogo.id}','${"a".repeat(64)}',100)`,false).status,0);
  ready(approvedLogo);
});
test("pending logos are private to administrators and cannot cross account boundaries",()=>{
  assert.equal(sql(as(ids.member,ids.a,`select public.cv_logo_access('${approvedLogo.id}')`)).out,"");
  assert.equal(sql(as(ids.owner,ids.b,`select public.cv_logo_access('${approvedLogo.id}')`)).out,"");
  assert.notEqual(sql(as(ids.owner,ids.b,`select public.cv_request_branding('Cross logo','', '${approvedLogo.id}', '')`),false).status,0);
  assert.equal(sql(as(ids.member,ids.a,"select count(*) from storage.objects where bucket_id='certverify-branding'")).out,"0");
  assert.notEqual(sql(as(ids.owner,ids.a,"insert into storage.objects(bucket_id,name) values('certverify-branding','forged')"),false).status,0);
});
test("only a separate MFA platform administrator can approve; duplicates are prevented",()=>{
  const id=request("Approved Company",ids.a,approvedLogo.id);
  assert.notEqual(sql(as(ids.owner,ids.a,`select public.cv_review_branding('${id}','approve')`,"aal2"),false).status,0);
  assert.notEqual(sql(superAs(`select public.cv_review_branding('${id}','approve')`,"aal1"),false).status,0);
  assert.notEqual(sql(as(ids.owner,ids.a,"select public.cv_request_branding('Duplicate','',null,'')"),false).status,0);
  approve(id);
  assert.equal(JSON.parse(sql(as(ids.member,ids.a,"select public.cv_current_branding()")).out).company_name,"Approved Company");
  assert.equal(sql(as(ids.member,ids.a,`select public.cv_logo_access('${approvedLogo.id}')`)).out,approvedLogo.path);
});
test("historical name and logo remain fixed after approval and new certificates use the new version",()=>{
  const old=JSON.parse(sql(`set role anon;select public.cv_public_certificate('brand-original')`).out);
  assert.equal(old.issuer_name,"Account A");assert.equal(old.logo_available,false);
  const fresh=sql(as(ids.member,ids.a,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.member}','${ids.a}','brand-new','${ids.templateA}','Active') returning id`)).out;
  assert.equal(JSON.parse(sql(`set role anon;select public.cv_public_certificate('brand-new')`).out).issuer_name,"Approved Company");
  assert.equal(sql(`set role anon;select public.cv_public_logo_path('brand-new')`).out,approvedLogo.path);
  assert.notEqual(sql(`update public.cv_certificate_branding set branding_version_id='${oldVersion}' where certificate_id='${fresh}'`,false).status,0);
  assert.notEqual(sql(`update public.cv_logo_assets set storage_path='other' where id='${approvedLogo.id}'`,false).status,0);
});
test("reject and request-information decisions are recorded without changing branding",()=>{
  let id=request("Rejected Company");sql(superAs(`select public.cv_review_branding('${id}','reject','Insufficient evidence')`));
  assert.equal(JSON.parse(sql(as(ids.member,ids.a,"select public.cv_current_branding()")).out).company_name,"Approved Company");
  id=request("Needs Information");sql(superAs(`select public.cv_review_branding('${id}','information','Provide documentation')`));
  sql(as(ids.owner,ids.a,`select public.cv_branding_information('${id}','Additional evidence supplied')`));
  assert.equal(sql(`select status from public.cv_branding_requests where id='${id}'`).out,"pending");
  sql(superAs(`select public.cv_review_branding('${id}','reject','Review not satisfied')`));
});
let permission:string;
test("scoped permissions are bound to exact proposed fields, recipient, account and expiry",()=>{
  const id=request("Permission Company",ids.a,undefined,"Permission professional details");
  assert.notEqual(sql(superAs(`select public.cv_review_branding('${id}','grant',null,'${ids.member}',array['company_name'],now()+interval '1 day')`),false).status,0);
  sql(superAs(`select public.cv_review_branding('${id}','grant',null,'${ids.member}',array['company_name','professional_details'],now()+interval '1 day')`));
  permission=sql(`select id from public.cv_branding_permissions where request_id='${id}'`).out;
  assert.notEqual(sql(as(ids.owner,ids.a,`select public.cv_apply_branding_permission('${permission}')`),false).status,0);
  assert.notEqual(sql(as(ids.member,ids.b,`select public.cv_apply_branding_permission('${permission}')`),false).status,0);
  sql(as(ids.member,ids.a,`select public.cv_apply_branding_permission('${permission}')`));
  assert.notEqual(sql(as(ids.member,ids.a,`select public.cv_apply_branding_permission('${permission}')`),false).status,0);
});
test("permission expiration and explicit revocation fail closed",()=>{
  let id=request("Expired Permission");sql(superAs(`select public.cv_review_branding('${id}','grant',null,'${ids.member}',array['company_name'],now()+interval '1 hour')`));
  let p=sql(`select id from public.cv_branding_permissions where request_id='${id}'`).out;
  sql(`update public.cv_branding_permissions set expires_at=now()-interval '1 second' where id='${p}'`);
  assert.notEqual(sql(as(ids.member,ids.a,`select public.cv_apply_branding_permission('${p}')`),false).status,0);
  sql(superAs(`select public.cv_revoke_branding_permission('${p}')`));sql(superAs(`select public.cv_review_branding('${id}','reject','Permission expired')`));
  id=request("Revoked Permission");sql(superAs(`select public.cv_review_branding('${id}','grant',null,'${ids.member}',array['company_name'],now()+interval '1 hour')`));
  p=sql(`select id from public.cv_branding_permissions where request_id='${id}'`).out;sql(superAs(`select public.cv_revoke_branding_permission('${p}')`));
  assert.notEqual(sql(as(ids.member,ids.a,`select public.cv_apply_branding_permission('${p}')`),false).status,0);
  sql(superAs(`select public.cv_review_branding('${id}','reject','Permission revoked')`));
});
test("concurrent approvals create one immutable version and one change event",async()=>{
  const id=request("Race Approved");
  const results=await Promise.all([concurrentSql(superAs(`select public.cv_review_branding('${id}','approve')`)),concurrentSql(superAs(`select public.cv_review_branding('${id}','approve')`))]);
  assert.equal(results.filter((result)=>result.status===0).length,1);
  assert.equal(sql(`select count(*) from public.cv_audit_events where action='branding.changed' and details->>'request_id'='${id}'`).out,"1");
  assert.notEqual(sql("delete from public.cv_branding_versions",false).status,0);
  assert.notEqual(sql("delete from public.cv_platform_audit_events",false).status,0);
});
test("unmapped historical certificates never inherit a later mutable issuer identity",()=>{
  const old=JSON.parse(sql("set role anon;select public.cv_public_certificate('A-1')").out);
  assert.equal(old.issuer_name,null);assert.equal(old.branding_reconciled,false);
});

test("individual accounts get the same approved professional branding workflow",()=>{
  const account="10000000-0000-0000-0000-000000000003";
  sql(`insert into public.accounts(id,account_name,account_code,account_type) values('${account}','Individual Professional','IND','individual');
    insert into public.account_members(account_id,user_id,role,status) values('${account}','${ids.owner}','owner','active');`);
  const id=request("Approved Individual Professional",account);
  approve(id);
  assert.equal(JSON.parse(sql(as(ids.owner,account,"select public.cv_current_branding()")).out).company_name,"Approved Individual Professional");
  assert.equal(sql(as(ids.member,ids.a,`select count(*) from public.cv_branding_versions where account_id='${account}'`)).out,"0");
});
test("historical association cannot be mapped to another organization's identity",()=>{
  const version=sql(`select current_version_id from public.cv_account_branding where account_id='${ids.b}'`).out;
  const legacy=sql("select id from public.certificates where certificate_id='A-1'").out;
  assert.notEqual(sql(`insert into public.cv_certificate_branding(certificate_id,account_id,branding_version_id,provenance) values('${legacy}','${ids.b}','${version}','reviewed_historical')`,false).status,0);
  assert.notEqual(sql(as(ids.member,ids.a,`select public.cv_apply_branding_version('${legacy}','${ids.member}','${ids.member}')`),false).status,0);
  assert.equal(sql("set role anon;select count(*) from storage.objects where bucket_id='certverify-branding'").out,"0");
});
test("approved logo persists on issued records after later identity changes",()=>{
  assert.equal(sql("set role anon;select public.cv_public_logo_path('brand-new')").out,approvedLogo.path);
  const id=request("Logo Removed Company",ids.a,null);approve(id);
  assert.equal(JSON.parse(sql(as(ids.owner,ids.a,"select public.cv_current_branding()")).out).logo_asset_id,null);
  assert.equal(sql("set role anon;select public.cv_public_logo_path('brand-new')").out,approvedLogo.path);
  assert.equal(JSON.parse(sql("set role anon;select public.cv_public_certificate('brand-new')").out).issuer_name,"Approved Company");
});
test("removed members immediately lose scoped permission access",()=>{
  const id=request("Membership Removal Permission");
  sql(superAs(`select public.cv_review_branding('${id}','grant',null,'${ids.member}',array['company_name'],now()+interval '1 hour')`));
  const p=sql(`select id from public.cv_branding_permissions where request_id='${id}'`).out;
  sql(`update public.account_members set status='removed' where account_id='${ids.a}' and user_id='${ids.member}'`);
  assert.notEqual(sql(as(ids.member,ids.a,`select public.cv_apply_branding_permission('${p}')`),false).status,0);
  assert.equal(sql(as(ids.member,ids.a,"select public.cv_current_branding()")).out,"");
  sql(`update public.account_members set status='active' where account_id='${ids.a}' and user_id='${ids.member}'`);
  sql(superAs(`select public.cv_revoke_branding_permission('${p}')`));sql(superAs(`select public.cv_review_branding('${id}','reject','Membership removed')`));
});
test("platform privilege revocation and excessive permission expiry fail closed",()=>{
  const id=request("Permission Duration");
  assert.notEqual(sql(superAs(`select public.cv_review_branding('${id}','grant',null,'${ids.member}',array['company_name'],now()+interval '8 days')`),false).status,0);
  sql(`update public.cv_platform_admins set active=false where user_id='${ids.other}'`);
  assert.notEqual(sql(superAs(`select public.cv_review_branding('${id}','approve')`),false).status,0);
  sql(`update public.cv_platform_admins set active=true where user_id='${ids.other}'`);
  sql(superAs(`select public.cv_review_branding('${id}','reject','Duration rejected')`));
});
test("read-only integration inspection executes without modifying the fixture",()=>{
  const before=sql("select count(*) from public.cv_branding_versions").out;
  sql(readFileSync("supabase/inspection/stage3-readonly.sql","utf8"));
  assert.equal(sql("select count(*) from public.cv_branding_versions").out,before);
});
test("finalization rechecks uploader membership and rolling upload limits",()=>{
  const asset=reserve();
  sql(`insert into storage.objects(bucket_id,name,metadata) values('certverify-branding','${asset.path}','{"mimetype":"image/webp","size":100}');
    update public.account_members set status='removed' where account_id='${ids.a}' and user_id='${ids.owner}';`);
  assert.notEqual(sql(`begin;set role service_role;set request.jwt.claims='{"role":"service_role"}';select public.cv_finalize_logo('${asset.id}','${"a".repeat(64)}',100)`,false).status,0);
  sql(`update public.account_members set status='active' where account_id='${ids.a}' and user_id='${ids.owner}'`);
  const count=Number(sql(`select count(*) from public.cv_logo_assets where account_id='${ids.a}'`).out);
  for(let index=count;index<10;index++) reserve();
  assert.notEqual(sql(as(ids.owner,ids.a,"select public.cv_reserve_logo()"),false).status,0);
  assert.equal(sql(`select state from public.cv_logo_assets where id='${asset.id}'`).out,"reserved");
});
