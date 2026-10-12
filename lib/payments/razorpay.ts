import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PaymentError,
  type PaymentGateway,
  type PaymentSnapshot,
  type OrderSnapshot,
} from "./types";
export function validSignature(
  raw: Uint8Array | string,
  signature: string,
  secret: string,
): boolean {
  if (!/^[a-fA-F0-9]{64}$/.test(signature) || !secret) return false;
  return timingSafeEqual(
    createHmac("sha256", secret).update(raw).digest(),
    Buffer.from(signature, "hex"),
  );
}
const identifier = (id: string, prefix: string) => {
  if (!new RegExp(`^${prefix}_[A-Za-z0-9]{1,80}$`).test(id))
    throw new PaymentError("Invalid gateway reference.");
  return id;
};
const integer = (value: unknown) => {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new PaymentError();
  return value as number;
};
export function razorpay(
  config: { keyId: string; keySecret: string; webhookSecret: string },
  transport: typeof fetch = fetch,
): PaymentGateway {
  if (
    !/^rzp_test_[A-Za-z0-9]+$/.test(config.keyId) ||
    !config.keySecret ||
    !config.webhookSecret
  )
    throw new PaymentError(
      "Only configured Razorpay test credentials are permitted.",
    );
  async function api(path: string, body?: unknown) {
    const response = await transport(`https://api.razorpay.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok)
      throw new PaymentError(
        "Gateway request could not be confirmed. Reconcile before retrying.",
      );
    return (await response.json()) as Record<string, unknown>;
  }
  function order(value: Record<string, unknown>): OrderSnapshot {
    if (
      typeof value.id !== "string" ||
      typeof value.receipt !== "string" ||
      typeof value.currency !== "string" ||
      !/^[A-Z]{3}$/.test(value.currency) ||
      typeof value.status !== "string"
    )
      throw new PaymentError();
    return {
      id: identifier(value.id, "order"),
      receipt: value.receipt,
      amount: integer(value.amount),
      currency: value.currency,
      status: value.status,
    };
  }
  return {
    name: "razorpay",
    capabilities: {
      recurringMandates: false,
      partialRefunds: true,
      cancelOrder: false,
    },
    async createOrder(input) {
      if (
        !/^[a-f0-9]{32}$/.test(input.receipt) ||
        !Number.isSafeInteger(input.amount) ||
        input.amount <= 0 ||
        !/^[A-Z]{3}$/.test(input.currency)
      )
        throw new PaymentError();
      return order(
        await api("orders", {
          amount: input.amount,
          currency: input.currency,
          receipt: input.receipt,
          partial_payment: false,
        }),
      );
    },
    async fetchOrder(id) {
      return order(await api(`orders/${identifier(id, "order")}`));
    },
    async fetchPayment(id) {
      const value = await api(`payments/${identifier(id, "pay")}`);
      if (
        value.id !== id ||
        typeof value.order_id !== "string" ||
        typeof value.currency !== "string" ||
        !/^[A-Z]{3}$/.test(value.currency) ||
        !["created", "authorized", "captured", "failed", "refunded"].includes(
          String(value.status),
        )
      )
        throw new PaymentError();
      return {
        paymentId: id,
        orderId: identifier(value.order_id, "order"),
        amount: integer(value.amount),
        currency: value.currency,
        status: value.status as PaymentSnapshot["status"],
        refunded: integer(value.amount_refunded),
      };
    },
    async refund(input) {
      if (
        !Number.isSafeInteger(input.amount) ||
        input.amount <= 0 ||
        !/^[a-f0-9]{32}$/.test(input.reference)
      )
        throw new PaymentError();
      const value = await api(
        `payments/${identifier(input.paymentId, "pay")}/refund`,
        {
          amount: input.amount,
          notes: { certverify_reference: input.reference },
        },
      );
      if (typeof value.id !== "string") throw new PaymentError();
      return { id: identifier(value.id, "rfnd") };
    },
    verifyCallback(orderId, paymentId, signature) {
      return validSignature(
        `${identifier(orderId, "order")}|${identifier(paymentId, "pay")}`,
        signature,
        config.keySecret,
      );
    },
    verifyWebhook(raw, signature, eventId) {
      if (
        raw.length > 65536 ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(eventId) ||
        !validSignature(raw, signature, config.webhookSecret)
      )
        throw new PaymentError("Invalid payment notification.");
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(Buffer.from(raw).toString("utf8"));
      } catch {
        throw new PaymentError("Invalid payment notification.");
      }
      const event = String(body.event);
      const payload = body.payload as
        | {
            payment?: { entity?: { id?: string } };
            dispute?: { entity?: { payment_id?: string } };
          }
        | undefined;
      const dispute = event === "payment.dispute.created";
      if (
        ![
          "payment.authorized",
          "payment.captured",
          "payment.failed",
          "refund.processed",
          "refund.failed",
          "payment.dispute.created",
          "order.paid",
        ].includes(event)
      )
        throw new PaymentError("Unsupported payment notification.");
      const paymentId = dispute
        ? payload?.dispute?.entity?.payment_id
        : payload?.payment?.entity?.id;
      // Refund notifications identify their payment through the refund entity.
      const refund = payload as
        | { refund?: { entity?: { payment_id?: string } } }
        | undefined;
      return {
        id: eventId,
        paymentId: identifier(
          paymentId ?? refund?.refund?.entity?.payment_id ?? "",
          "pay",
        ),
        type: dispute ? "dispute" : "payment",
      };
    },
  };
}
