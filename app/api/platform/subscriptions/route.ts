import {
  platformContext,
  platformError,
  privateJson,
} from "@/lib/platform/server";
import { accountId, integer } from "@/lib/platform/validation";
import { reference, BillingInputError } from "@/lib/billing/validation";
import { RequestError } from "@/lib/auth/request";
export async function GET(request: Request) {
  try {
    const { client } = await platformContext(request);
    const params = new URL(request.url).searchParams;
    const { data, error } = await client.rpc(
      "cv_platform_subscription_report",
      {
        p_account: params.get("account")
          ? accountId(params.get("account")!)
          : null,
        p_page: integer(params.get("page"), 1),
      },
    );
    if (error)
      throw new RequestError("Subscriptions could not be loaded.", 503);
    return privateJson(data);
  } catch (error) {
    return platformError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { client } = await platformContext(request);
    const body = await request.json();
    if (
      !Number.isSafeInteger(body.seats) ||
      body.seats < 1 ||
      body.seats > 10000 ||
      typeof body.reason !== "string" ||
      !body.reason.trim() ||
      body.reason.length > 2000
    )
      throw new BillingInputError(
        "A valid seat allowance and complimentary grant reason are required.",
      );
    const { data, error } = await client.rpc("cv_admin_grant_subscription", {
      p_account: reference(body.accountId),
      p_plan: reference(body.planId),
      p_seats: body.seats,
      p_reason: body.reason.trim(),
    });
    if (error)
      throw new RequestError(
        "Complimentary access was not granted. Check eligibility, account status, seat reservations and open subscription requests.",
        409,
      );
    return privateJson(data);
  } catch (error) {
    return error instanceof BillingInputError
      ? Response.json({ error: error.message }, { status: 400 })
      : platformError(error);
  }
}
