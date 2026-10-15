import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabaseHarness } from "./harness";

// Isolated no-network PostgreSQL. Never reads hosted staging or real credentials.
const {start,close,sql,as,ids} = createDatabaseHarness({freshStaging:true});
let account="";
before(async()=>{
  await start();
  sql(readFileSync("supabase/proposals/20261015_scoped_logo_storage.sql","utf8"));
  sql(readFileSync("supabase/proposals/20261015_fix_restrictive_logo_policies.sql","utf8"));
  sql(`insert into auth.users(id,email,email_confirmed_at) values
    ('${ids.owner}','logo.owner@example.test',now()),
    ('${ids.other}','logo.other@example.test',now());`);
  account=sql(`select account_id from public.account_members where user_id='${ids.owner}'`).out;
});
after(close);

function insertTestImage(path:string,who:string) {
  const statement=`insert into storage.objects(bucket_id,name,metadata)
    values('certverify-branding','${path}','{"mimetype":"image/webp","size":4000}'::jsonb)`;
  // Storage does not forward x-certverify-account, so this call deliberately
  // supplies a valid user JWT but no customer account-selection header.
  return sql(as(who,null,statement),false);
}

test("only reserved logo owner may upload; failed restrictive rules cannot override authorized uploads",()=>{
  const reservation=JSON.parse(sql(as(ids.owner,account,"select public.cv_reserve_logo()")).out);
  const another=JSON.parse(sql(as(ids.owner,account,"select public.cv_reserve_logo()")).out);
  const paths=[reservation.path,another.path];
  assert.match(paths[0],/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/i);
  assert.notEqual(insertTestImage(paths[1],ids.other).status,0,
    "Unrelated authenticated users cannot write another owner's reservation");
  assert.equal(insertTestImage(paths[0],ids.owner).status,0,
    "Owner's upload should pass all permissive and restrictive Storage policies");
  assert.equal(sql(`select count(*) from storage.objects where bucket_id='certverify-branding'`).out,"1");
  assert.equal(sql(as(ids.owner,null,"select count(*) from storage.objects where bucket_id='certverify-branding'")).out,"0",
    "Unfinalized reserved logos cannot be read");

  const finished=sql(as(ids.owner,account,`select public.cv_finalize_logo('${reservation.id}','${"f".repeat(64)}',4000)`));
  assert.equal(finished.out,"t");
  assert.equal(sql(as(ids.owner,null,"select count(*) from storage.objects where bucket_id='certverify-branding'")).out,"1",
    "Original uploader can preview the finalized image without a custom Storage header");
  assert.equal(sql("begin;set local role anon;select count(*) from storage.objects where bucket_id='certverify-branding';commit;").out,"0",
    "Anonymous users cannot see unpublished logos");
  sql(as(ids.owner,null,`delete from storage.objects where name='${reservation.path}'`),false);
  assert.equal(sql("select count(*) from storage.objects where bucket_id='certverify-branding'").out,"1",
    "Uploaded logos remain immutable even when RLS hides rows from DELETE");
});
