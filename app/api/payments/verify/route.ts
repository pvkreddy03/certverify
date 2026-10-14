import {
  authenticatedRequest,
  RequestError,
  requestErrorResponse,
} from "@/lib/auth/request";
import { configuredGateway } from "@/lib/payments/config";
import {
  paymentService,
  reconcilePayment,
  paymentError,
  boundedBody,
  paymentBudget,
} from "@/lib/payments/server";
import { uuid, object } from "@/lib/payments/validation";
import { PaymentError } from "@/lib/payments/types";
import { privateJson } from "@/lib/platform/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { client } = await authenticatedRequest(request);
    const { data, error } = await client.rpc("cv_payment_attempt", {
      p_attempt: uuid(new URL(request.url).searchParams.get("attempt")),
    });
    if (error)
      throw new RequestError("Payment is unavailable for this account.", 403);
    return privateJson(data);
  } catch (error) {
    return error instanceof RequestError
      ? requestErrorResponse(error)
      : paymentError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedRequest(request);
    const gateway = configuredGateway();
    const service = await paymentService();
    await paymentBudget(service, user.id, "verification", 30);
    const body = object(
      JSON.parse(
        Buffer.from(await boundedBody(request, 4096)).toString("utf8"),
      ),
    );
    const { data, error } = await client.rpc("cv_payment_attempt", {
      p_attempt: uuid(body.attemptId),
    });
    if (error || !data.order_id)
      throw new RequestError("Payment is unavailable for this account.", 403);
    if (
      typeof body.paymentId !== "string" ||
      typeof body.signature !== "string" ||
      !gateway.verifyCallback(data.order_id, body.paymentId, body.signature)
    )
      throw new PaymentError("Invalid payment confirmation.");
    const payment = await gateway.fetchPayment(body.paymentId);
    if (payment.orderId !== data.order_id)
      throw new PaymentError("Payment belongs to a different order.");
    await reconcilePayment(gateway, service, body.paymentId);
    const result = await client.rpc("cv_payment_attempt", {
      p_attempt: data.id,
    });
    if (result.error) throw new PaymentError();
    return privateJson(result.data);
  } catch (error) {
    return error instanceof RequestError
      ? requestErrorResponse(error)
      : paymentError(error);
  }
}
