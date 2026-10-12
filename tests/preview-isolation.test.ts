import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPreviewIsolation, isProtectedProject } from "../lib/hosting/isolation";
import { paymentService } from "../lib/payments/server";
import { configuredGateway } from "../lib/payments/config";
test("preview build rejects inherited production credentials and falsely labelled protected projects",()=>{
  for(const e of [{VERCEL_ENV:'preview'},{VERCEL_ENV:'preview',CERTVERIFY_DEPLOYMENT_TARGET:'isolated_sandbox',CERTVERIFY_SANDBOX_PROJECT_REF:'jhnxztaqfikgvkshifel',NEXT_PUBLIC_SUPABASE_URL:'https://jhnxztaqfikgvkshifel.supabase.co'},{VERCEL_ENV:'production',CERTVERIFY_DEPLOYMENT_TARGET:'isolated_sandbox'}])assert.throws(()=>assertPreviewIsolation(e));
  assert.doesNotThrow(()=>assertPreviewIsolation({VERCEL_ENV:'preview',CERTVERIFY_DEPLOYMENT_TARGET:'isolated_sandbox',CERTVERIFY_SANDBOX_PROJECT_REF:'abcdefghijklmnopqrst',NEXT_PUBLIC_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co'}));
  assert.doesNotThrow(()=>assertPreviewIsolation({}));
});
test("protected-source checks use actual host rather than a lookalike domain",()=>{
  assert.equal(isProtectedProject(undefined,'https://jhnxztaqfikgvkshifel.supabase.co'),true);
  assert.equal(isProtectedProject(undefined,'https://jhnxztaqfikgvkshifel.supabase.co.attacker.test'),false);
});
test("payment adapter/service cannot target source even under a forged sandbox declaration",()=>{
  const names=['CERTVERIFY_PAYMENT_MODE','CERTVERIFY_DEPLOYMENT_TARGET','CERTVERIFY_SANDBOX_PROJECT_REF','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SECRET_KEY'];
  const original=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  try{
    process.env.CERTVERIFY_PAYMENT_MODE='razorpay_test';process.env.CERTVERIFY_DEPLOYMENT_TARGET='isolated_sandbox';process.env.CERTVERIFY_SANDBOX_PROJECT_REF='jhnxztaqfikgvkshifel';process.env.NEXT_PUBLIC_SUPABASE_URL='https://jhnxztaqfikgvkshifel.supabase.co';process.env.SUPABASE_SECRET_KEY='fixture-only-not-a-key';
    assert.throws(()=>configuredGateway());assert.throws(()=>paymentService());
  }finally{for(const n of names)if(original[n]===undefined)delete process.env[n];else process.env[n]=original[n];}
});
