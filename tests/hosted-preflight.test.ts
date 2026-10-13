import assert from "node:assert/strict";
import { test } from "node:test";
import { hostedPreflight } from "../lib/hosting/preflight";
import { previewEnv } from "./preview-fixtures";
const env = previewEnv;
test("offline hosted preflight distinguishes configuration from integration proof and hides values", () => {
  const result = hostedPreflight(env);
  assert.equal(result.readyForHostedVerification, true);
  assert.equal(result.hostedIntegrationVerified, false);
  assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SECRET_KEY));
});
test("sandbox preflight rejects production context, project mismatch and public secret bindings", () => {
  for (const override of [{ VERCEL_ENV: "production" }, { NEXT_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co" }, { NEXT_PUBLIC_SERVICE_ROLE_KEY: "confidential-fixture" }, { CERTVERIFY_DEPLOYMENT_TARGET: "production" }, { NEXT_PUBLIC_APP_URL: "http://localhost:3000" }]) {
    assert.equal(hostedPreflight({ ...env, ...override }).readyForHostedVerification, false);
  }
});
test("preflight rejects live gateway credentials and incomplete test credentials", () => {
  assert.equal(hostedPreflight({ ...env, CERTVERIFY_PAYMENT_MODE: "razorpay_test", RAZORPAY_TEST_KEY_ID: "rzp_live_fixture" }).readyForHostedVerification, false);
  assert.equal(hostedPreflight({ ...env, CERTVERIFY_PAYMENT_MODE: "live" }).readyForHostedVerification, false);
  assert.equal(hostedPreflight({ ...env, CERTVERIFY_PAYMENT_MODE: "razorpay_test", RAZORPAY_TEST_KEY_ID: "rzp_test_fixture", RAZORPAY_TEST_KEY_SECRET: "fixture-api-secret", RAZORPAY_TEST_WEBHOOK_SECRET: "fixture-hook-secret" }).readyForHostedVerification, true);
});

test("known protected source is rejected even when labelled sandbox",()=>{
  assert.equal(hostedPreflight({...env,CERTVERIFY_SANDBOX_PROJECT_REF:"jhnxztaqfikgvkshifel",NEXT_PUBLIC_SUPABASE_URL:"https://jhnxztaqfikgvkshifel.supabase.co"}).readyForHostedVerification,false);
});
