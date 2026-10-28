import { authenticatedRequest, requestErrorResponse } from "@/lib/auth/request";
import { privateJson } from "@/lib/platform/server";
import { paymentTestReadiness } from "@/lib/payments/readiness";

export const runtime = "nodejs";

export async function GET(request:Request) {
  try {
    await authenticatedRequest(request);
    return privateJson(paymentTestReadiness(process.env));
  } catch(error) {
    return requestErrorResponse(error);
  }
}
