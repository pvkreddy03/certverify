import { configuredGateway } from "@/lib/payments/config";
import {
  boundedBody,
  fingerprint,
  paymentService,
  reconcilePayment,
  paymentError,
  checkedRpc,
  paymentBudget,
} from "@/lib/payments/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const gateway = configuredGateway();
    const raw = await boundedBody(request);
    const notice = gateway.verifyWebhook(
      raw,
      request.headers.get("x-razorpay-signature") ?? "",
      request.headers.get("x-razorpay-event-id") ?? "",
    );
    const service = paymentService();
    const digest = fingerprint(raw);
    if (
      (await checkedRpc(service, "cv_gateway_event_seen", {
        p_event: `webhook:${notice.id}`,
        p_fingerprint: digest,
        p_payment: notice.paymentId,
      })) === true
    )
      return Response.json(
        { received: true, duplicate: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    await paymentBudget(service, notice.paymentId, "webhook", 30);
    await reconcilePayment(
      gateway,
      service,
      notice.paymentId,
      `webhook:${notice.id}`,
      digest,
      notice.type === "dispute",
    );
    return Response.json(
      { received: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return paymentError(error);
  }
}
