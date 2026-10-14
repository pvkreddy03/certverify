import {
  authenticatedRequest,
  RequestError,
  requestErrorResponse,
} from "@/lib/auth/request";
import { privateJson } from "@/lib/platform/server";
import {
  requireSimulationOwner,
  simulateCheckout,
  simulationEnabled,
  simulationNotice,
  SimulationError,
} from "@/lib/payments/simulation";
import { boundedBody } from "@/lib/payments/server";

export const runtime = "nodejs";

function simulationError(error: unknown) {
  return requestErrorResponse(
    error instanceof SimulationError
      ? new RequestError(error.message, error.status)
      : error,
  );
}

export async function GET(request: Request) {
  try {
    const { client, user, accountId } = await authenticatedRequest(request);
    if (!simulationEnabled(process.env))
      return privateJson({ enabled: false });
    await requireSimulationOwner(client, user.email_confirmed_at, accountId);
    return privateJson({ enabled: true, message: simulationNotice });
  } catch (error) {
    return simulationError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { client, user, accountId } = await authenticatedRequest(request);
    if (!simulationEnabled(process.env))
      throw new SimulationError("Checkout demonstration is unavailable.", 404);
    let body: unknown;
    try {
      body = JSON.parse(
        Buffer.from(await boundedBody(request, 256)).toString("utf8"),
      );
    } catch {
      throw new SimulationError("Invalid demonstration request.", 400);
    }
    const result = simulateCheckout(body);
    await requireSimulationOwner(client, user.email_confirmed_at, accountId);
    // No gateway, privileged client, payment record, quote or entitlement call.
    return privateJson(result);
  } catch (error) {
    return simulationError(error);
  }
}
