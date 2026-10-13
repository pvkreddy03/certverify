import { assertPreviewIsolation } from "../hosting/isolation";
import { isProtectedProject } from "../hosting/isolation";
import { getSupabaseAdmin } from "../supabase/server";
import { createHash } from "node:crypto";
import { RequestError, requestErrorResponse } from "../auth/request";
import { PaymentError, type PaymentGateway } from "./types";
export async function paymentService() {
  assertPreviewIsolation(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new PaymentError();
  if (process.env.CERTVERIFY_PAYMENT_MODE === "razorpay_test") {
    const ref = process.env.CERTVERIFY_SANDBOX_PROJECT_REF;
    if (
      isProtectedProject(ref,url) ||
      !ref ||
      !/^[a-z0-9]{8,40}$/.test(ref) ||
      new URL(url).origin !== `https://${ref}.supabase.co`
    )
      throw new PaymentError(
        "Payment database must match the explicitly configured sandbox project.",
      );
  }
  // This client uses only narrowly granted payment RPCs; never raw financial table writes.
  return getSupabaseAdmin();
}
export type PaymentService = Awaited<ReturnType<typeof paymentService>>;
export async function checkedRpc(
  service: PaymentService,
  name: string,
  params: Record<string, unknown>,
) {
  const { data, error } = await service.rpc(name, params);
  if (error)
    throw new PaymentError(
      "Payment state could not be confirmed. No success is assumed; reconcile before retrying.",
    );
  return data;
}
export const fingerprint = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
export async function reconcilePayment(
  gateway: PaymentGateway,
  service: PaymentService,
  paymentId: string,
  eventId?: string,
  digest?: string,
  disputed = false,
) {
  const payment = await gateway.fetchPayment(paymentId);
  const [order, context] = await Promise.all([
    gateway.fetchOrder(payment.orderId),
    checkedRpc(service, "cv_gateway_order_context", {
      p_order: payment.orderId,
    }),
  ]);
  if (
    !context ||
    order.id !== payment.orderId ||
    order.receipt !== context.receipt ||
    order.amount !== context.amount_minor ||
    order.currency !== context.currency ||
    payment.amount !== order.amount ||
    payment.currency !== order.currency ||
    payment.refunded > payment.amount
  )
    throw new PaymentError("Payment does not match a CertVerify checkout.");
  gateway.validateMoney({
    amount: context.amount_minor,
    currency: context.currency,
    currencyExponent: context.currency_exponent,
  });
  const normalized = JSON.stringify({ ...payment, disputed });
  return checkedRpc(service, "cv_process_gateway_payment", {
    p_order: order.id,
    p_payment: payment.paymentId,
    p_amount: payment.amount,
    p_currency: payment.currency,
    p_status: payment.status,
    p_refunded: payment.refunded,
    p_event:
      eventId ??
      `reconcile:${payment.paymentId}:${payment.status}:${payment.refunded}`,
    p_fingerprint: digest ?? fingerprint(normalized),
    p_disputed: disputed,
  });
}
export async function boundedBody(request: Request, limit = 65536) {
  if (Number(request.headers.get("content-length") ?? 0) > limit)
    throw new PaymentError("Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new PaymentError("Request is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export function paymentError(error: unknown) {
  if (error instanceof RequestError) return requestErrorResponse(error);
  // Gateway/SQL payloads and raw request bodies are never returned or logged.
  return Response.json(
    {
      error:
        error instanceof PaymentError
          ? error.message
          : "Payment request could not be completed.",
    },
    {
      status: error instanceof PaymentError ? 409 : 500,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}

export { consumeRequestBudget as paymentBudget } from "../security/request-budget";
