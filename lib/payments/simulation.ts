import { approvedStagingProject } from "../hosting/isolation";

export const simulationNotice =
  "Demo only — no payment recorded or subscription activated.";

export class SimulationError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** A UI demonstration, deliberately separate from payment adapters and settlement. */
export function simulationEnabled(env: Record<string, string | undefined>) {
  return (
    env.VERCEL_ENV === "preview" &&
    env.CERTVERIFY_DEPLOYMENT_TARGET === "isolated_sandbox" &&
    env.CERTVERIFY_SANDBOX_PROJECT_REF === approvedStagingProject &&
    env.NEXT_PUBLIC_SUPABASE_URL ===
      `https://${approvedStagingProject}.supabase.co` &&
    env.CERTVERIFY_PAYMENT_MODE === "disabled"
  );
}

type ReadOnlyClient = {
  rpc: (
    name: "cv_list_accounts" | "cv_customer_account_states",
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function requireSimulationOwner(
  client: ReadOnlyClient,
  emailConfirmedAt: string | undefined,
  accountId: string | null,
) {
  if (!emailConfirmedAt || !accountId)
    throw new SimulationError("A verified account owner is required.", 403);
  // Subscription status can materialize scheduled periods. These two functions
  // only read membership and account access; this demo cannot change finances.
  const [memberships, states] = await Promise.all([
    client.rpc("cv_list_accounts"),
    client.rpc("cv_customer_account_states"),
  ]);
  if (memberships.error || states.error)
    throw new SimulationError("Checkout demonstration is unavailable.", 503);
  if (
    !Array.isArray(memberships.data) ||
    !Array.isArray(states.data) ||
    !memberships.data.some(
      (record) => record?.id === accountId && record?.role === "owner",
    ) ||
    !states.data.some(
      (record) => record?.account_id === accountId && record?.status === "active",
    )
  )
    throw new SimulationError("An active account owner is required.", 403);
}

export function simulateCheckout(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("outcome" in value) ||
    typeof value.outcome !== "string" ||
    !["approved", "declined", "cancelled"].includes(value.outcome)
  )
    throw new SimulationError("Choose a valid demonstration outcome.", 400);
  return {
    demoOnly: true,
    outcome: value.outcome as "approved" | "declined" | "cancelled",
    message: simulationNotice,
    paymentRecorded: false,
    subscriptionActivated: false,
    settlement: null,
  } as const;
}
