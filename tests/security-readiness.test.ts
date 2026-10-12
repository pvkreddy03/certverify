import { configuredGateway } from "../lib/payments/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { migrationPlan } from "../lib/security/migration-plan";
import { consumeRequestBudget } from "../lib/security/request-budget";
import { RequestError, requestErrorResponse } from "../lib/auth/request";
test("reproducible migration manifest orders dependencies and remains proposal-only", () => {
  assert.equal(migrationPlan.length, 7);
  for (const name of migrationPlan) {
    const sql = readFileSync(`supabase/proposals/${name}`, "utf8");
    assert.match(sql, /begin;/i);
    assert.match(sql, /commit;/i);
  }
  const runner = readFileSync("scripts/migration-manifest.ts", "utf8");
  assert.equal(runner.includes("PRINT ONLY"), true);
});
test("request budgets use keyed hashes, honor denial and fail closed without configuration", async () => {
  const prior = process.env.CERTVERIFY_RATE_LIMIT_SECRET;
  let calls = 0;
  const service = {
    rpc: async (_name: string, params: Record<string, unknown>) => {
      calls++;
      assert.match(String(params.p_key), /^[a-f0-9]{64}$/);
      assert.equal(String(params.p_key).includes("user-fixture"), false);
      return { data: false, error: null };
    },
  };
  try {
    delete process.env.CERTVERIFY_RATE_LIMIT_SECRET;
    await assert.rejects(
      consumeRequestBudget(service, "user-fixture", "checkout"),
      (e: unknown) => e instanceof RequestError && e.status === 503,
    );
    assert.equal(calls, 0);
    process.env.CERTVERIFY_RATE_LIMIT_SECRET =
      "isolated-rate-limit-secret-32bytes-minimum";
    await assert.rejects(
      consumeRequestBudget(service, "user-fixture", "checkout"),
      (e: unknown) => e instanceof RequestError && e.status === 429,
    );
  } finally {
    if (prior === undefined) delete process.env.CERTVERIFY_RATE_LIMIT_SECRET;
    else process.env.CERTVERIFY_RATE_LIMIT_SECRET = prior;
  }
});
test("authentication and internal errors are non-cacheable and redact confidential details", async () => {
  for (const error of [
    new RequestError("Denied", 401),
    new Error("secret-fixture-token"),
  ]) {
    const response = requestErrorResponse(error);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(
      (await response.text()).includes("secret-fixture-token"),
      false,
    );
  }
});

test("payment configuration cannot activate on a production Vercel deployment", () => {
  const prior = {
    mode: process.env.CERTVERIFY_PAYMENT_MODE,
    target: process.env.CERTVERIFY_DEPLOYMENT_TARGET,
    vercel: process.env.VERCEL_ENV,
  };
  try {
    process.env.CERTVERIFY_PAYMENT_MODE = "razorpay_test";
    process.env.CERTVERIFY_DEPLOYMENT_TARGET = "isolated_sandbox";
    process.env.VERCEL_ENV = "production";
    assert.throws(
      configuredGateway,
      /Production payment collection is disabled/,
    );
  } finally {
    for (const [key, v] of [
      ["CERTVERIFY_PAYMENT_MODE", prior.mode],
      ["CERTVERIFY_DEPLOYMENT_TARGET", prior.target],
      ["VERCEL_ENV", prior.vercel],
    ] as const) {
      if (v === undefined) delete process.env[key];
      else process.env[key] = v;
    }
  }
});
