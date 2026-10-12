import assert from "node:assert/strict";
import { test } from "node:test";
import { hostedPreflight } from "../lib/hosting/preflight";
const env = { VERCEL_ENV: "preview", CERTVERIFY_DEPLOYMENT_TARGET: "isolated_sandbox", CERTVERIFY_SANDBOX_PROJECT_REF: "abcdefghijklmnopqrst", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key", SUPABASE_SECRET_KEY: "fixture-private-key", NEXT_PUBLIC_APP_URL: "https://certverify-sandbox.example.test", CERTVERIFY_RATE_LIMIT_SECRET: "x".repeat(32) };
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
