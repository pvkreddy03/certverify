import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requireSimulationOwner,
  simulateCheckout,
  simulationEnabled,
  simulationNotice,
} from "../lib/payments/simulation";
import { approvedStagingProject, protectedSourceProject } from "../lib/hosting/isolation";

const accountId = "10000000-0000-0000-0000-000000000001";
const otherAccount = "10000000-0000-0000-0000-000000000002";
const preview: Record<string, string | undefined> = {
  VERCEL_ENV: "preview",
  CERTVERIFY_DEPLOYMENT_TARGET: "isolated_sandbox",
  CERTVERIFY_SANDBOX_PROJECT_REF: approvedStagingProject,
  NEXT_PUBLIC_SUPABASE_URL: `https://${approvedStagingProject}.supabase.co`,
  CERTVERIFY_PAYMENT_MODE: "disabled",
};

function readonlyClient(
  memberships: unknown = [{ id: accountId, role: "owner" }],
  states: unknown = [{ account_id: accountId, status: "active" }],
) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      async rpc(name: "cv_list_accounts" | "cv_customer_account_states") {
        calls.push(name);
        assert.ok(["cv_list_accounts", "cv_customer_account_states"].includes(name));
        return {
          data: name === "cv_list_accounts" ? memberships : states,
          error: null,
        };
      },
    },
  };
}

test("checkout demonstration is limited to exact staging Preview with real collection disabled", () => {
  assert.equal(simulationEnabled(preview), true);
  for (const override of [
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: "development" },
    { VERCEL_ENV: undefined },
    { CERTVERIFY_DEPLOYMENT_TARGET: "production" },
    { CERTVERIFY_SANDBOX_PROJECT_REF: protectedSourceProject },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${protectedSourceProject}.supabase.co` },
    { NEXT_PUBLIC_SUPABASE_URL: `https://${approvedStagingProject}.supabase.co.attacker.test` },
    { CERTVERIFY_PAYMENT_MODE: "razorpay_test" },
    { CERTVERIFY_PAYMENT_MODE: "live" },
  ])
    assert.equal(simulationEnabled({ ...preview, ...override }), false);
  assert.equal(simulationEnabled({}), false);
});

test("demo authorization uses only existing readonly membership and access functions", async () => {
  const { client, calls } = readonlyClient();
  await requireSimulationOwner(client, "2026-10-01T00:00:00Z", accountId);
  assert.deepEqual(calls.sort(), ["cv_customer_account_states", "cv_list_accounts"]);
});

test("organization admin, member, removed member and cross-account owner cannot use the demo", async () => {
  for (const memberships of [
    [{ id: accountId, role: "admin" }],
    [{ id: accountId, role: "member" }],
    [{ id: otherAccount, role: "owner" }],
    [],
    null,
  ]) {
    const { client } = readonlyClient(memberships);
    await assert.rejects(requireSimulationOwner(client, "confirmed", accountId));
  }
});

test("unconfirmed and suspended account owners fail closed without privileged credentials", async () => {
  const owner = readonlyClient();
  await assert.rejects(requireSimulationOwner(owner.client, undefined, accountId));
  await assert.rejects(requireSimulationOwner(owner.client, "confirmed", null));
  assert.deepEqual(owner.calls, []);
  for (const states of [
    [{ account_id: accountId, status: "suspended" }],
    [{ account_id: otherAccount, status: "active" }],
    [],
    null,
  ])
    await assert.rejects(
      requireSimulationOwner(readonlyClient(undefined, states).client, "confirmed", accountId),
    );
});

test("failed authorization reads cannot turn a demonstration into an approval", async () => {
  const client = {
    rpc: async () => ({ data: [{ id: accountId, role: "owner" }], error: new Error("private database detail") }),
  };
  await assert.rejects(requireSimulationOwner(client, "confirmed", accountId), /demonstration is unavailable/);
});

test("demo refuses client prices, paid statuses, payment IDs, signatures and forged outcomes", () => {
  for (const body of [
    null, [], "approved", {}, { outcome: "captured" },
    { outcome: "approved", amount: 1 },
    { outcome: "approved", currency: "INR" },
    { outcome: "approved", paymentId: "pay_forged" },
    { outcome: "approved", signature: "forged" },
    { outcome: "approved", status: "paid" },
    { outcome: "approved", accountId: otherAccount },
    { outcome: ["approved"] },
    { outcome: { toString: () => "approved" } },
  ])
    assert.throws(() => simulateCheckout(body), /valid demonstration outcome/);
});

test("all simulated outcomes explicitly record no payment, settlement or entitlement activation", () => {
  for (const outcome of ["approved", "declined", "cancelled"])
    assert.deepEqual(simulateCheckout({ outcome }), {
      demoOnly: true,
      outcome,
      message: simulationNotice,
      paymentRecorded: false,
      subscriptionActivated: false,
      settlement: null,
    });
});

test("concurrent repeated demonstration requests perform no financial processing", async () => {
  const { client, calls } = readonlyClient();
  const results = await Promise.all(
    Array.from({ length: 20 }, async () => {
      await requireSimulationOwner(client, "confirmed", accountId);
      return simulateCheckout({ outcome: "approved" });
    }),
  );
  assert.equal(calls.length, 40);
  assert.ok(calls.every((name) => ["cv_list_accounts", "cv_customer_account_states"].includes(name)));
  assert.ok(results.every((result) => !result.paymentRecorded && !result.subscriptionActivated && result.settlement === null));
});
