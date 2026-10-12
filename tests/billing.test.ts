import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoney, formatMoney } from "../lib/billing/money";
import {
  billingCommand,
  pricingCommand,
  BillingInputError,
} from "../lib/billing/validation";
import { disabledProvider, PaymentsUnavailable } from "../lib/billing/provider";
const id = "10000000-0000-0000-0000-000000000001";
test("decimal monetary inputs convert to exact minor units without floating point rounding", () => {
  assert.equal(parseMoney("399"), 39900);
  assert.equal(parseMoney("0.29"), 29);
  assert.equal(parseMoney("123.456", 3), 123456);
  assert.equal(parseMoney("999", 0), 999);
  for (const value of ["-1", "1.005", "NaN", "1e3", "1000000000"])
    assert.throws(() => parseMoney(value));
  assert.match(formatMoney(99900, "INR"), /999/);
});
test("billing commands never accept a client supplied payable amount or entitlement", () => {
  const command = billingCommand({
    action: "quote",
    planId: id,
    seats: 5,
    coupon: " WELCOME ",
    intent: "start",
    amount: 0,
    paid: true,
  });
  assert.deepEqual(command.params, {
    p_plan: id,
    p_seats: 5,
    p_coupon: "WELCOME",
    p_intent: "start",
  });
  for (const input of [
    { action: "quote", planId: id, seats: 0, coupon: "", intent: "start" },
    { action: "accept", quoteId: "other", nonce: id },
    { action: "settle", paid: true },
  ])
    assert.throws(() => billingCommand(input), BillingInputError);
});
test("pricing administration uses catalog revisions and rejects malformed actions/codes", () => {
  assert.equal(
    pricingCommand({
      action: "status",
      id,
      kind: "plan",
      status: "archived",
      revision: 2,
    }).rpc,
    "cv_set_catalog_status",
  );
  assert.throws(
    () =>
      pricingCommand({
        action: "save_offer",
        code: "bad code",
        terms: {},
        revision: 0,
      }),
    BillingInputError,
  );
  assert.throws(
    () => pricingCommand({ action: "delete", id }),
    BillingInputError,
  );
});
test("Stage 6 provider interface refuses checkout and webhook processing while unconfigured", async () => {
  await assert.rejects(
    disabledProvider.createCheckout({
      id,
      accountId: id,
      amountMinor: 99900,
      currency: "INR",
      quoteId: id,
    }),
    PaymentsUnavailable,
  );
  await assert.rejects(
    disabledProvider.verifyWebhook(new Uint8Array(), new Headers()),
    PaymentsUnavailable,
  );
});
