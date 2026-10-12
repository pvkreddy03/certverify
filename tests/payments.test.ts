import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { razorpay, validSignature } from "../lib/payments/razorpay";
import { configuredGateway } from "../lib/payments/config";
import {
  boundedBody,
  fingerprint,
  reconcilePayment,
} from "../lib/payments/server";
import type { PaymentService } from "../lib/payments/server";
const config = {
  keyId: "rzp_test_fixture",
  keySecret: "isolated-test-secret",
  webhookSecret: "isolated-webhook-secret",
};
const raw = Buffer.from(
  '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_fixture"}}}}',
);
const sign = (body: Uint8Array | string, secret = config.webhookSecret) =>
  createHmac("sha256", secret).update(body).digest("hex");
function gateway(override: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const transport = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    if (init?.method === "POST")
      return Response.json({
        id: "order_fixture",
        receipt: "a".repeat(32),
        amount: 39900,
        currency: "INR",
        status: "created",
      });
    return String(input).includes("/orders/")
      ? Response.json({
          id: "order_fixture",
          receipt: "a".repeat(32),
          amount: 39900,
          currency: "INR",
          status: "paid",
          ...override,
        })
      : Response.json({
          id: "pay_fixture",
          order_id: "order_fixture",
          amount: 39900,
          currency: "INR",
          status: "captured",
          amount_refunded: 0,
          ...override,
        });
  }) as typeof fetch;
  return { provider: razorpay(config, transport), calls };
}
test("Razorpay uses exact raw HMAC and canonical checkout fields with constant-time comparison", () => {
  const g = gateway().provider;
  assert.equal(validSignature(raw, sign(raw), config.webhookSecret), true);
  assert.equal(
    validSignature(
      Buffer.concat([raw, Buffer.from(" ")]),
      sign(raw),
      config.webhookSecret,
    ),
    false,
  );
  assert.equal(
    g.verifyCallback(
      "order_fixture",
      "pay_fixture",
      sign("order_fixture|pay_fixture", config.keySecret),
    ),
    true,
  );
  assert.equal(
    g.verifyCallback(
      "order_other",
      "pay_fixture",
      sign("order_fixture|pay_fixture", config.keySecret),
    ),
    false,
  );
  for (const signature of [
    "",
    "a".repeat(63),
    "z".repeat(64),
    sign(raw).slice(0, -1) + "f",
  ])
    assert.equal(validSignature(raw, signature, config.webhookSecret), false);
});
test("forged webhook signatures fail before trusting payload and supported refund/dispute references normalize", () => {
  const g = gateway().provider;
  assert.throws(() => g.verifyWebhook(raw, "a".repeat(64), "evt_fixture"));
  assert.equal(
    g.verifyWebhook(raw, sign(raw), "evt_fixture").paymentId,
    "pay_fixture",
  );
  for (const [event, payload, type] of [
    [
      "refund.processed",
      { refund: { entity: { payment_id: "pay_fixture" } } },
      "payment",
    ],
    [
      "payment.dispute.created",
      { dispute: { entity: { payment_id: "pay_fixture" } } },
      "dispute",
    ],
  ] as const) {
    const body = Buffer.from(JSON.stringify({ event, payload }));
    assert.equal(g.verifyWebhook(body, sign(body), "event").type, type);
  }
  assert.throws(() => g.verifyWebhook(raw, sign(raw), "../forged"));
  assert.throws(() =>
    g.verifyWebhook(Buffer.alloc(65537), "a".repeat(64), "evt"),
  );
});
test("live credentials and unconfigured collection are rejected without contacting any provider", () => {
  assert.throws(() => razorpay({ ...config, keyId: "rzp_live_forbidden" }));
  assert.throws(() => razorpay({ ...config, keySecret: "" }));
  const prior = process.env.CERTVERIFY_PAYMENT_MODE;
  process.env.CERTVERIFY_PAYMENT_MODE = "disabled";
  try {
    assert.throws(configuredGateway);
  } finally {
    if (prior === undefined) delete process.env.CERTVERIFY_PAYMENT_MODE;
    else process.env.CERTVERIFY_PAYMENT_MODE = prior;
  }
});
test("adapter isolates provider endpoints, capabilities and validates order/input money", async () => {
  const { provider, calls } = gateway();
  assert.equal(provider.capabilities.recurringMandates, false);
  assert.equal(provider.capabilities.cancelOrder, false);
  assert.equal(provider.capabilities.partialRefunds, true);
  await provider.createOrder({
    receipt: "a".repeat(32),
    amount: 39900,
    currency: "INR",
    currencyExponent: 2,
  });
  assert.equal(calls[0], "https://api.razorpay.com/v1/orders");
  await assert.rejects(provider.fetchPayment("../../orders"));
  await assert.rejects(
    provider.createOrder({
      receipt: "a".repeat(32),
      amount: NaN,
      currency: "INR",
      currencyExponent: 2,
    }),
  );
});
test("authoritative reconciliation rejects wrong amount, currency and order receipt before settlement", async () => {
  let settlements = 0;
  const service = {
    rpc: async (name: string) =>
      name === "cv_gateway_order_context"
        ? {
            data: {
              receipt: "a".repeat(32),
              amount_minor: 39900,
              currency: "INR",
              currency_exponent: 2,
            },
            error: null,
          }
        : { data: { state: "captured" }, error: (settlements++, null) },
  } as unknown as PaymentService;
  await reconcilePayment(gateway().provider, service, "pay_fixture");
  assert.equal(settlements, 1);
  for (const patch of [
    { amount: 1 },
    { currency: "USD" },
    { receipt: "b".repeat(32) },
  ])
    await assert.rejects(
      reconcilePayment(gateway(patch).provider, service, "pay_fixture"),
    );
  assert.equal(settlements, 1);
});
test("unbounded/chunked notification bodies are rejected and fingerprints preserve raw bytes", async () => {
  await assert.rejects(
    boundedBody(
      new Request("https://example.test", { method: "POST", body: "long" }),
      3,
    ),
  );
  assert.equal(
    (
      await boundedBody(
        new Request("https://example.test", { method: "POST", body: "ok" }),
        3,
      )
    ).length,
    2,
  );
  assert.notEqual(
    fingerprint(raw),
    fingerprint(Buffer.concat([raw, Buffer.from(" ")])),
  );
});

test("provider order reconciliation rejects payment lists containing another order or oversized histories", async () => {
  for (const items of [
    [{ id: "pay_fixture", order_id: "order_other" }],
    Array.from({ length: 21 }, () => ({
      id: "pay_fixture",
      order_id: "order_fixture",
    })),
  ]) {
    const provider = razorpay(config, (async () =>
      Response.json({ items })) as typeof fetch);
    await assert.rejects(provider.fetchOrderPayments("order_fixture"));
  }
  const provider = razorpay(config, (async () =>
    Response.json({
      items: [{ id: "pay_fixture", order_id: "order_fixture" }],
    })) as typeof fetch);
  assert.deepEqual(await provider.fetchOrderPayments("order_fixture"), [
    "pay_fixture",
  ]);
});
test("noncanonical currency precision is rejected before any gateway request", async () => {
  const { provider, calls } = gateway();
  const input = {
    receipt: "a".repeat(32),
    amount: 39900,
    currency: "INR",
    currencyExponent: 3,
  };
  await assert.rejects(provider.createOrder(input));
  assert.equal(calls.length, 0);
});
