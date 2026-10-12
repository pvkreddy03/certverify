import { createHmac } from "node:crypto";
import { RequestError } from "../auth/request";
type BudgetService = {
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};
export async function consumeRequestBudget(
  service: BudgetService,
  subject: string,
  scope: string,
  limit = 20,
) {
  const secret = process.env.CERTVERIFY_RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32)
    throw new RequestError(
      "Payment safeguards are not configured. No charge was initiated.",
      503,
    );
  const key = createHmac("sha256", secret)
    .update(`${scope}:${subject}`)
    .digest("hex");
  const { data, error } = await service.rpc("cv_consume_request_budget", {
    p_key: key,
    p_limit: limit,
  });
  if (error)
    throw new RequestError(
      "Request safeguards are unavailable. Retry later.",
      503,
    );
  if (data !== true)
    throw new RequestError(
      "Too many requests. Wait a minute before retrying.",
      429,
    );
}
