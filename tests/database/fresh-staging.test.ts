import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabaseHarness } from "./harness";
const { start, close, sql, as, ids, quote, concurrentSql } = createDatabaseHarness({ freshStaging: true });
let a = "", b = "";
before(async () => {
  await start();
  sql(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    ('${ids.owner}','owner@example.test',now(),'{"professional_name":"Synthetic Issuer","super_admin":true,"role":"super_admin"}'),
    ('${ids.other}','other@example.test',now(),'{"professional_name":"Other Issuer"}'),
    ('${ids.unconfirmed}','pending@example.test',null,'{}');`);
  a = sql(`select account_id from public.account_members where user_id='${ids.owner}'`).out;
  b = sql(`select account_id from public.account_members where user_id='${ids.other}'`).out;
});
after(close);
test("fresh baseline refuses existing application databases", () => {
  assert.notEqual(sql(readFileSync("supabase/staging/20261012_fresh_baseline.sql", "utf8"), false).status, 0);
});
test("genuine application signup trigger initializes one personal account and branding without paid/admin access", () => {
  assert.equal(sql(`select count(*) from public.account_members where user_id='${ids.owner}'`).out, "1");
  assert.equal(sql(`select account_type from public.accounts where id='${a}'`).out, "individual");
  assert.equal(sql(`select count(*) from public.cv_account_branding where account_id='${a}'`).out, "1");
  assert.equal(sql(`select count(*) from public.cv_platform_admins`).out, "0");
  assert.equal(sql(as(ids.owner,a,"select public.cv_is_platform_admin()", "aal2")).out, "f");
  const state = JSON.parse(sql(as(ids.owner,a,"select public.cv_subscription_status()")).out);
  assert.equal(state.entitled,false);
});
test("fresh account/profile access is tenant isolated and unconfirmed signup is not issuer access", () => {
  assert.equal(sql(as(ids.owner,a,`select count(*) from public.accounts where id='${b}'`)).out,"0");
  assert.equal(sql(as(ids.owner,a,`select count(*) from public.profiles where user_id='${ids.other}'`)).out,"0");
  const pending = sql(`select account_id from public.account_members where user_id='${ids.unconfirmed}'`).out;
  assert.notEqual(sql(as(ids.unconfirmed,pending,"select public.cv_generate_certificate_id()"),false).status,0);
});
test("numbering is account-scoped, concurrent-safe and has no direct/anonymous helper entry",async()=>{
  const results=await Promise.all(Array.from({length:8},()=>concurrentSql(as(ids.owner,a,"select public.cv_generate_certificate_id()"))));
  for(const r of results)assert.equal(r.status,0,r.error);
  const numbers=results.map(r=>r.out);
  assert.equal(new Set(numbers).size,8);
  assert.ok(numbers.every(n=>!n.includes(ids.owner)));
  assert.notEqual(sql(as(ids.owner,b,"select public.cv_generate_certificate_id()"),false).status,0);
  for(const role of ['anon','authenticated','service_role'])
    assert.equal(sql(`select has_function_privilege('${role}','public.generate_certificate_id(uuid)','EXECUTE')`).out,'f');
});
test("large certificate numbers cannot truncate into previous IDs",()=>{
  sql(`update public.staging_certificate_counters set next_number=99999999 where account_id='${a}'`);
  const first=sql(as(ids.owner,a,"select public.cv_generate_certificate_id()")).out;
  const next=sql(as(ids.owner,a,"select public.cv_generate_certificate_id()")).out;
  assert.ok(first.endsWith('-99999999'));assert.ok(next.endsWith('-100000000'));assert.notEqual(first,next);
});
test("only reviewed public catalog/certificate/logo projections are anonymously executable definers",()=>{
  const allowed=sql(`select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')`).out;
  assert.equal(allowed,'cv_pricing_catalog,cv_public_certificate,cv_public_logo_path');
  const unsafePaths=sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not coalesce('search_path=""'=any(p.proconfig),false)`).out;
  assert.equal(unsafePaths,'0');
});
test("private financial and numbering tables deny raw service-role access",()=>{
  for(const table of ['staging_certificate_counters','cv_billing_quotes','cv_billing_periods','cv_payment_events'])
    assert.equal(sql(`select has_table_privilege('service_role','public.${table}','SELECT')`).out,'f');
});
test("fresh signup can select trial, issue private/public fields and retain issuer verification",()=>{
  // Explicit fixture grant, not hosted bootstrap: the real owner remains approval/MFA gated.
  sql(`insert into public.cv_platform_admins(user_id) values('${ids.other}')`);
  const terms={name:'Synthetic trial',description:'Disposable fixture only',eligibility:['individual','organization'],audience:'standard',billing_period:'monthly',custom_days:30,price_minor:0,renewal_price_minor:0,currency:'INR',currency_exponent:2,included_seats:5,extra_seat_price_minor:0,max_seats:5,certificate_limit:2,trial_days:7,visible:true,features:['QR'],starts_at:null,ends_at:null};
  const plan=sql(as(ids.other,null,`select public.cv_save_plan(${quote(JSON.stringify(terms))}::jsonb)`,'aal2')).out;
  sql(as(ids.other,null,`select public.cv_set_catalog_status('plan','${plan}','active',1)`,'aal2'));
  const q=JSON.parse(sql(as(ids.owner,a,`select public.cv_quote_subscription('${plan}',5,null,'trial')`)).out);
  sql(as(ids.owner,a,`select public.cv_accept_subscription('${q.id}',gen_random_uuid())`));
  const template=sql(as(ids.owner,a,`insert into public.certificate_templates(user_id,account_id,name) values('${ids.owner}','${a}','Synthetic template') returning id`)).out;
  const num=sql(as(ids.owner,a,'select public.cv_generate_certificate_id()')).out;
  const cert=sql(as(ids.owner,a,`insert into public.certificates(user_id,account_id,template_id,certificate_id) values('${ids.owner}','${a}','${template}',${quote(num)}) returning id`)).out;
  sql(as(ids.owner,a,`insert into public.certificate_field_values(certificate_id,field_name,field_value,is_public) values('${cert}','Public','Synthetic value',true),('${cert}','Private','DO NOT EXPOSE',false)`));
  const record=JSON.parse(sql(`set role anon;select public.cv_public_certificate(${quote(num)})`).out);
  assert.equal(record.issuer_name,'Synthetic Issuer');assert.ok(!JSON.stringify(record).includes('DO NOT EXPOSE'));
  const usage=JSON.parse(sql(as(ids.owner,a,'select public.cv_subscription_status()')).out);
  assert.equal(usage.entitled,true);
});

test("fresh organization invitation, switching, removal and historical issuance work together",()=>{
  sql(as(ids.owner,a,'select public.cv_upgrade_account()'));
  const token='7'.repeat(64);
  sql(as(ids.owner,a,`select public.cv_prepare_invitation('other@example.test','${token}')`));
  sql(as(ids.other,null,`select public.cv_accept_invitation('${token}')`));
  const memberships=JSON.parse(sql(as(ids.other,null,"select coalesce(jsonb_agg(t),'[]'::jsonb) from public.cv_list_accounts() t")).out);
  assert.equal(memberships.length,2);
  assert.notEqual(sql(as(ids.other,a,'select public.cv_billing_owner()'),false).status,0);
  const template=sql(`select id from public.certificate_templates where account_id='${a}'`).out;
  const num=sql(as(ids.other,a,'select public.cv_generate_certificate_id()')).out;
  const cert=sql(as(ids.other,a,`insert into public.certificates(user_id,account_id,template_id,certificate_id) values('${ids.other}','${a}','${template}',${quote(num)}) returning id`)).out;
  const membership=sql(`select id from public.account_members where user_id='${ids.other}' and account_id='${a}'`).out;
  sql(as(ids.owner,a,`select public.cv_manage_member('${membership}',null,true)`));
  assert.equal(sql(as(ids.other,a,`select count(*) from public.certificates where id='${cert}'`)).out,'0');
  assert.equal(sql(`select count(*) from public.certificates where id='${cert}'`).out,'1');
  assert.notEqual(sql(as(ids.other,a,'select public.cv_generate_certificate_id()'),false).status,0);
  sql(as(ids.owner,a,`select public.cv_change_certificate_status('${cert}','Revoked','Synthetic internal reason','Synthetic revoked certificate')`));
  const record=JSON.parse(sql(`set role anon;select public.cv_public_certificate(${quote(num)})`).out);
  assert.equal(record.status,'Revoked');assert.ok(!JSON.stringify(record).includes('Synthetic internal reason'));
});
test("fresh Auth-user deletion cannot cascade away issuance evidence",()=>{
  assert.notEqual(sql(`delete from auth.users where id='${ids.owner}'`,false).status,0);
  assert.equal(sql(`select count(*) from public.certificates where account_id='${a}'`).out,'2');
});

test("legacy definer ACL candidates are read-only and preserve authenticated policy helpers",()=>{
  sql('grant execute on function public.is_account_admin(uuid) to public,anon');
  const report=sql(readFileSync('supabase/inspection/legacy-definer-privilege-candidates.sql','utf8')).out;
  assert.ok(report.includes('revoke execute on function'));
  assert.equal(sql("select has_function_privilege('anon','public.is_account_admin(uuid)','EXECUTE')").out,'t');
  // Execute the same reviewed statement only in this disposable database.
  sql('revoke execute on function public.is_account_admin(uuid) from public,anon;grant execute on function public.is_account_admin(uuid) to authenticated');
  assert.equal(sql("select has_function_privilege('anon','public.is_account_admin(uuid)','EXECUTE')").out,'f');
  assert.equal(sql("select has_function_privilege('authenticated','public.is_account_admin(uuid)','EXECUTE')").out,'t');
});
