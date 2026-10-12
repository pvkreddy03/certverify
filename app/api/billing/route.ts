import {
  authenticatedRequest,
  RequestError,
  requestErrorResponse,
} from "@/lib/auth/request";
import { billingCommand, BillingInputError } from "@/lib/billing/validation";
import { privateJson } from "@/lib/platform/server";
export async function GET(request: Request) {
  try {
    const { client } = await authenticatedRequest(request);
    const [status, catalog] = await Promise.all([
      client.rpc("cv_subscription_status"),
      client.rpc("cv_pricing_catalog"),
    ]);
    if (status.error || catalog.error)
      throw new RequestError("Subscription details could not be loaded.", 503);
    return privateJson({ subscription: status.data, plans: catalog.data });
  } catch (error) {
    return requestErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { client } = await authenticatedRequest(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new BillingInputError("Invalid subscription request.");
    }
    const command = billingCommand(body);
    const rpc =
      command.action === "quote"
        ? "cv_quote_subscription"
        : command.action === "accept"
          ? "cv_accept_subscription"
          : "cv_subscription_action";
    const { data, error } = await client.rpc(rpc, command.params);
    if (error?.message === "Paid requests require reviewed refund handling")
      throw new RequestError(
        "This request has a verified payment. Contact support for a reviewed refund; its paid period is preserved.",
        409,
      );
    if (error)
      throw new RequestError(
        "This subscription action could not be applied. Check eligibility, seats, coupon terms and any existing request; refresh before retrying.",
        409,
      );
    return privateJson(data);
  } catch (error) {
    return error instanceof BillingInputError
      ? Response.json({ error: error.message }, { status: 400 })
      : requestErrorResponse(error);
  }
}
