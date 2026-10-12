import {
  platformContext,
  platformError,
  privateJson,
} from "@/lib/platform/server";
import { pricingCommand, BillingInputError } from "@/lib/billing/validation";
import { RequestError } from "@/lib/auth/request";
export async function GET(request: Request) {
  try {
    const { client } = await platformContext(request);
    const { data, error } = await client.rpc("cv_platform_billing_catalog");
    if (error)
      throw new RequestError("Pricing catalog could not be loaded.", 503);
    return privateJson(data);
  } catch (error) {
    return platformError(error);
  }
}
export async function POST(request: Request) {
  try {
    const { client } = await platformContext(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new BillingInputError("Invalid pricing request.");
    }
    const command = pricingCommand(body);
    const { data, error } = await client.rpc(command.rpc, command.params);
    if (error)
      throw new RequestError(
        "Pricing was not changed. Check all terms and refresh the catalog revision.",
        409,
      );
    return privateJson({ id: data });
  } catch (error) {
    return error instanceof BillingInputError
      ? Response.json({ error: error.message }, { status: 400 })
      : platformError(error);
  }
}
