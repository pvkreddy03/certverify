import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentTestReadiness } from "../lib/payments/readiness";

const staging = {
  VERCEL_ENV: "preview",
  VERCEL_URL: "certverify-test123-pvkreddy03.vercel.app",
  CERTVERIFY_DEPLOYMENT_TARGET: "isolated_sandbox",
  CERTVERIFY_SANDBOX_PROJECT_REF: "nubohxesjeaodqcveiud",
  NEXT_PUBLIC_SUPABASE_URL: "https://nubohxesjeaodqcveiud.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_unit_test_fixture_key",
  SUPABASE_SECRET_KEY: "sb_secret_unit_test_fixture_key",
  CERTVERIFY_RATE_LIMIT_SECRET: "a".repeat(40),
  CERTVERIFY_PAYMENT_MODE: "razorpay_test",
  RAZORPAY_TEST_KEY_ID: "rzp_test_validfixture",
  RAZORPAY_TEST_KEY_SECRET: "fake_secret_for_offline_test",
  RAZORPAY_TEST_WEBHOOK_SECRET: "fake_webhook_for_offline_test",
};

test("sandbox readiness reports configuration only, never payment success or secrets", () => {
  const status=paymentTestReadiness(staging);
  assert.equal(status.mode,"razorpay_test");
  assert.equal(status.configured,true);
  assert.equal(status.livePaymentsEnabled,false);
  const report=JSON.stringify(status);
  assert.ok(!report.includes(staging.RAZORPAY_TEST_KEY_SECRET));
  assert.ok(!report.includes(staging.RAZORPAY_TEST_WEBHOOK_SECRET));
});
test("disabled mode and missing keys never imply a verified payment", () => {
  const disabled=paymentTestReadiness({...staging,CERTVERIFY_PAYMENT_MODE:"disabled"});
  assert.equal(disabled.configured,false);
  assert.equal(disabled.mode,"disabled");
  for(const patch of [{RAZORPAY_TEST_KEY_SECRET:""},{RAZORPAY_TEST_WEBHOOK_SECRET:""},{RAZORPAY_TEST_KEY_ID:"rzp_live_forbidden"}]){
    const status=paymentTestReadiness({...staging,...patch});
    assert.equal(status.configured,false);
    assert.equal(status.mode,"incomplete");
  }
});
test("protected source, wrong DB, or production never show configured test checkout", () => {
  for(const patch of [
    {VERCEL_ENV:"production"},
    {CERTVERIFY_SANDBOX_PROJECT_REF:"jhnxztaqfikgvkshifel"},
    {NEXT_PUBLIC_SUPABASE_URL:"https://jhnxztaqfikgvkshifel.supabase.co"},
    {CERTVERIFY_DEPLOYMENT_TARGET:"production"},
  ]) {
    assert.equal(paymentTestReadiness({...staging,...patch}).configured,false);
  }
});
