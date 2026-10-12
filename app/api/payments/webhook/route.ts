import { configuredGateway } from "@/lib/payments/config";
import {
  boundedBody,
  fingerprint,
  paymentService,
  reconcilePayment,
  paymentError,
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
    await reconcilePayment(
      gateway,
      paymentService(),
      notice.paymentId,
      `webhook:${notice.id}`,
      fingerprint(raw),
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
