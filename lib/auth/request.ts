import { assertPreviewIsolation } from "@/lib/hosting/isolation";
import { createClient } from "@supabase/supabase-js";
import { ACCOUNT_HEADER, isAccountId } from "@/lib/accounts/context";

export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function authenticatedRequest(request: Request, requireAccount = true) {
  assertPreviewIsolation(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new RequestError("Authentication is unavailable.", 503);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !authorization.slice(7).trim()) {
    throw new RequestError("Authentication required.", 401);
  }
  const accountId = request.headers.get(ACCOUNT_HEADER);
  if (requireAccount && !isAccountId(accountId)) throw new RequestError("Choose a valid account.", 400);
  const headers: Record<string, string> = { Authorization: authorization };
  if (isAccountId(accountId)) headers[ACCOUNT_HEADER] = accountId;
  const client = createClient(url, key, {
    global: { headers },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: { user }, error } = await client.auth.getUser(authorization.slice(7).trim());
  if (error || !user) throw new RequestError("Your login session is invalid or expired.", 401);
  return { client, user, accountId };
}

export function requestErrorResponse(error: unknown) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"} });
  // Never expose provider errors, SQL details, tokens or request bodies.
  return Response.json({ error: "The operation could not be completed. Please try again." }, { status: 500, headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"} });
}
