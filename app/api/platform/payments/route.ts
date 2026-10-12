import {
  platformContext,
  privateJson,
  platformError,
} from "@/lib/platform/server";
import { configuredGateway } from "@/lib/payments/config";
import {
  paymentService,
  checkedRpc,
  reconcilePayment,
  boundedBody,
  paymentError,
} from "@/lib/payments/server";
import { uuid, object } from "@/lib/payments/validation";
import { RequestError } from "@/lib/auth/request";
import { PaymentError } from "@/lib/payments/types";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const { client } = await platformContext(request);
    const url = new URL(request.url);
    const account = url.searchParams.get("account"),
      page = Number(url.searchParams.get("page") ?? 1);
    const { data, error } = await client.rpc("cv_platform_payment_report", {
      p_account: account ? uuid(account) : null,
      p_page: page,
    });
    if (error)
      throw new RequestError("Payment report could not be loaded.", 409);
    return privateJson(data);
  } catch (error) {
    return platformError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { client } = await platformContext(request);
    const gateway = configuredGateway();
    const body = object(
      JSON.parse(
        Buffer.from(await boundedBody(request, 4096)).toString("utf8"),
      ),
    );
    const service = paymentService();
    if (body.action === "reconcile" && typeof body.paymentId === "string")
      return privateJson(
        await reconcilePayment(gateway, service, body.paymentId),
      );
    if (body.action === "bind_order" && typeof body.orderId === "string") {
      const order = await gateway.fetchOrder(body.orderId);
      await checkedRpc(service, "cv_bind_gateway_order", {
        p_attempt: uuid(body.attemptId),
        p_order: order.id,
        p_receipt: order.receipt,
        p_amount: order.amount,
        p_currency: order.currency,
      });
      return privateJson({ bound: true });
    }
    if (body.action === "refund") {
      if (
        !Number.isSafeInteger(body.amountMinor) ||
        typeof body.reason !== "string"
      )
        throw new PaymentError("Refund amount and reason required.");
      const { data, error } = await client.rpc("cv_prepare_refund", {
        p_attempt: uuid(body.attemptId),
        p_amount: body.amountMinor,
        p_reason: body.reason,
      });
      if (error)
        throw new RequestError(
          "Refund cannot start; inspect prior commands and payment state.",
          409,
        );
      const refund = await gateway.refund({
        paymentId: data.payment_id,
        amount: data.amount_minor,
        reference: data.reference,
      });
      await checkedRpc(service, "cv_bind_refund", {
        p_command: data.id,
        p_refund: refund.id,
      });
      return privateJson({ requested: true, commandId: data.id });
    }
    throw new PaymentError("Unsupported financial operation.");
  } catch (error) {
    return error instanceof RequestError
      ? platformError(error)
      : paymentError(error);
  }
}
