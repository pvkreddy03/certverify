import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPreviewIsolation, assertPrivilegedConfiguration, verifyPrivilegedCredentials, isProtectedProject, verifyPreviewCredentials, previewOrigin, approvedStagingProject } from "../lib/hosting/isolation";
import { getSupabaseAdmin } from "../lib/supabase/server";
import { paymentService } from "../lib/payments/server";
import { previewEnv, fixtureKey } from "./preview-fixtures";
import { configuredGateway } from "../lib/payments/config";
test("preview build rejects inherited production credentials and falsely labelled protected projects",()=>{
  for(const e of [{VERCEL_ENV:'preview'},{VERCEL_ENV:'preview',CERTVERIFY_DEPLOYMENT_TARGET:'isolated_sandbox',CERTVERIFY_SANDBOX_PROJECT_REF:'jhnxztaqfikgvkshifel',NEXT_PUBLIC_SUPABASE_URL:'https://jhnxztaqfikgvkshifel.supabase.co'},{VERCEL_ENV:'production',CERTVERIFY_DEPLOYMENT_TARGET:'isolated_sandbox'}])assert.throws(()=>assertPreviewIsolation(e));
  assert.doesNotThrow(()=>assertPreviewIsolation(previewEnv));
  assert.doesNotThrow(()=>assertPreviewIsolation({}));
});
test("protected-source checks use actual host rather than a lookalike domain",()=>{
  assert.equal(isProtectedProject(undefined,'https://jhnxztaqfikgvkshifel.supabase.co'),true);
  assert.equal(isProtectedProject(undefined,'https://jhnxztaqfikgvkshifel.supabase.co.attacker.test'),false);
});
test("payment adapter/service cannot target source even under a forged sandbox declaration",async()=>{
  const names=['CERTVERIFY_PAYMENT_MODE','CERTVERIFY_DEPLOYMENT_TARGET','CERTVERIFY_SANDBOX_PROJECT_REF','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY'];
  const original=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try{
    process.env.CERTVERIFY_PAYMENT_MODE='razorpay_test';process.env.CERTVERIFY_DEPLOYMENT_TARGET='isolated_sandbox';process.env.CERTVERIFY_SANDBOX_PROJECT_REF='jhnxztaqfikgvkshifel';process.env.NEXT_PUBLIC_SUPABASE_URL='https://jhnxztaqfikgvkshifel.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-only-not-a-key';
    assert.throws(()=>configuredGateway());await assert.rejects(()=>paymentService());
  }finally{for(const n of names)if(original[n]===undefined)delete process.env[n];else process.env[n]=original[n];}
});

test("Preview refuses missing/wrong credentials and secrets in any public variable",()=>{
  const overrides=[{NEXT_PUBLIC_SUPABASE_ANON_KEY:undefined},{CERTVERIFY_RATE_LIMIT_SECRET:undefined},{RAZORPAY_TEST_KEY_ID:"rzp_live_fixture"},{NEXT_PUBLIC_SUPABASE_ANON_KEY:fixtureKey('service_role')},{NEXT_PUBLIC_OTHER:previewEnv.SUPABASE_SECRET_KEY},{NEXT_PUBLIC_SUPABASE_ANON_KEY:'sb_secret_'+ 'x'.repeat(32)}];
  for(const change of overrides)assert.throws(()=>assertPreviewIsolation({...previewEnv,...change}));
  assert.throws(()=>assertPreviewIsolation({...previewEnv,CERTVERIFY_SANDBOX_PROJECT_REF:'abcdefghijklmnopqrst',NEXT_PUBLIC_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co'}));
});
test("Preview origin derives from provider hostname and rejects inherited Production origin",()=>{
  assert.equal(previewOrigin({...previewEnv,NEXT_PUBLIC_APP_URL:undefined}),previewEnv.NEXT_PUBLIC_APP_URL);
  for(const change of [{VERCEL_URL:'attacker.test'},{VERCEL_URL:'certverify.vercel.app/path'},{NEXT_PUBLIC_APP_URL:'https://production.example.test'}])assert.throws(()=>assertPreviewIsolation({...previewEnv,...change}));
});
test("Preview credential verification checks only approved staging and never reads user payloads",async()=>{
  const paths:string[]=[];
  const mock:typeof fetch=async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.hostname,`${approvedStagingProject}.supabase.co`);
    assert.equal(init?.redirect,'error');assert.equal(init?.method,'GET');paths.push(url.pathname);
    const response=new Response('private fixture contents',{headers:{'Content-Type':'application/json'}});
    response.json=async()=>{throw new Error('User data must not be read');};return response;
  };
  await verifyPreviewCredentials(previewEnv,mock);
  assert.deepEqual(paths,['/rest/v1/']);
});
test("Preview public verification rejects blocked provider access and redirected/HTML responses without echoing errors",async()=>{
  const env={...previewEnv,SUPABASE_SECRET_KEY:'sb_secret_'+'y'.repeat(32)};
  for(const mock of [async()=>new Response('',{status:401}),async()=>new Response('login',{headers:{'Content-Type':'text/html'}}),async()=>{throw new Error(env.SUPABASE_SECRET_KEY);}]){
    await assert.rejects(()=>verifyPreviewCredentials(env,mock as typeof fetch),e=>e instanceof Error&&e.message.includes('No build')&&!e.message.includes(env.SUPABASE_SECRET_KEY));
  }
});

test("public Preview compilation remains isolated without a usable private credential",async()=>{
  for(const key of [undefined,'not-a-server-key',fixtureKey('service_role','jhnxztaqfikgvkshifel')]) {
    const env={...previewEnv,SUPABASE_SECRET_KEY:key};
    assert.doesNotThrow(()=>assertPreviewIsolation(env));
    const mock:typeof fetch=async(input,init)=>{
      assert.equal(String(input),`https://${approvedStagingProject}.supabase.co/rest/v1/`);
      assert.equal((init?.headers as Record<string,string>).apikey,previewEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      return new Response('{}',{headers:{'Content-Type':'application/json'}});
    };
    await verifyPreviewCredentials(env,mock);
    assert.throws(()=>assertPrivilegedConfiguration(env));
  }
});

test("privileged verification rejects missing, malformed and source keys before making a request",async()=>{
  for(const key of [undefined,'sb_secret_short',fixtureKey('anon'),fixtureKey('service_role','jhnxztaqfikgvkshifel')]) {
    let requests=0;
    await assert.rejects(()=>verifyPrivilegedCredentials({...previewEnv,SUPABASE_SECRET_KEY:key},async()=>{requests++;return new Response('{}');}));
    assert.equal(requests,0);
  }
});

test("opaque server credentials are authoritatively checked only at the pinned staging host",async()=>{
  const env={...previewEnv,SUPABASE_SECRET_KEY:'sb_secret_'+'z'.repeat(32)};
  let requests=0;
  await verifyPrivilegedCredentials(env,async(input,init)=>{
    requests++;
    assert.equal(String(input),`https://${approvedStagingProject}.supabase.co/auth/v1/admin/users?page=1&per_page=1`);
    assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    assert.equal((init?.headers as Record<string,string>).apikey,env.SUPABASE_SECRET_KEY);
    const response=new Response('unread private contents',{headers:{'Content-Type':'application/json'}});
    response.json=async()=>{throw new Error('private payload must not be read');};return response;
  });
  assert.equal(requests,1);
});

test("privileged verification refuses revoked and wrong-project opaque keys without disclosing provider errors",async()=>{
  const env={...previewEnv,SUPABASE_SECRET_KEY:'sb_secret_'+'z'.repeat(32)};
  for(const mock of [async()=>new Response('',{status:401}),async()=>new Response('',{status:403}),async()=>new Response('redirect',{status:302}),async()=>new Response('login',{headers:{'Content-Type':'text/html'}}),async()=>{throw new Error(env.SUPABASE_SECRET_KEY);}]) {
    await assert.rejects(()=>verifyPrivilegedCredentials(env,mock as typeof fetch),e=>e instanceof Error&&e.message.includes('No database fallback')&&!e.message.includes(env.SUPABASE_SECRET_KEY));
  }
});

test("privileged client can be imported without its key and invocation fails safely with 503",async()=>{
  const original=process.env.SUPABASE_SECRET_KEY;
  try {
    delete process.env.SUPABASE_SECRET_KEY;
    await assert.rejects(()=>getSupabaseAdmin(),e=>e instanceof Error && 'status' in e && e.status===503);
  } finally { if(original===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=original; }
});
