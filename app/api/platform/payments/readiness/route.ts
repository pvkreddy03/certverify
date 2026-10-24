import { platformContext, platformError, privateJson } from "@/lib/platform/server";
import { paymentTestReadiness } from "@/lib/payments/readiness";

export const runtime = "nodejs";

/** Administrative, read-only. Never return gateway secrets or infer settlement. */
export async function GET(request:Request) {
  try {
    await platformContext(request);
    return privateJson(paymentTestReadiness(process.env));
  } catch(error) {
    return platformError(error);
  }
}
