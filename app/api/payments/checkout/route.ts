import {
  authenticatedRequest,
  requestErrorResponse,
  RequestError,
} from "@/lib/auth/request";
import { configuredGateway } from "@/lib/payments/config";
import {
  paymentService,
  checkedRpc,
  paymentError,
  boundedBody,
  paymentBudget,
} from "@/lib/payments/server";
import { uuid, object } from "@/lib/payments/validation";
import { privateJson } from "@/lib/platform/server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { client, user } = await authenticatedRequest(request);
    const gateway = configuredGateway();
    const service = await paymentService();
    await paymentBudget(service, user.id, "checkout"); // Disabled configuration performs no reservation or external request.
    const body = object(
      JSON.parse(
        Buffer.from(await boundedBody(request, 4096)).toString("utf8"),
      ),
    );
    const { data, error } = await client.rpc("cv_prepare_checkout", {
      p_intent: uuid(body.intentId),
    });
    if (error)
      throw new RequestError(
        "Checkout cannot start. Refresh the quote and check account eligibility.",
        409,
      );
    gateway.validateMoney({
      amount: data.amount_minor,
      currency: data.currency,
      currencyExponent: data.currency_exponent,
    });
    let orderId = data.order_id;
    if (data.create_order) {
      const order = await gateway.createOrder({
        receipt: data.receipt,
        amount: data.amount_minor,
        currency: data.currency,
        currencyExponent: data.currency_exponent,
      });
      await checkedRpc(service, "cv_bind_gateway_order", {
        p_attempt: data.id,
        p_order: order.id,
        p_receipt: order.receipt,
        p_amount: order.amount,
        p_currency: order.currency,
      });
      orderId = order.id;
    }
    return privateJson({
      attemptId: data.id,
      orderId,
      amount: data.amount_minor,
      currency: data.currency,
      keyId: process.env.RAZORPAY_TEST_KEY_ID,
      expiresAt: data.expires_at,
      state: data.state,
      testMode: true,
    });
  } catch (error) {
    return error instanceof RequestError
      ? requestErrorResponse(error)
      : paymentError(error);
  }
}
