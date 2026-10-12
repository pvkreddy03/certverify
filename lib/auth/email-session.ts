import type { SupabaseClient, EmailOtpType } from "@supabase/supabase-js";

// React Strict Mode can replay a mount before the first one-time OTP request
// completes. Share only that proof operation per client/URL; getUser is rechecked
// every time, so a cached proof never authorizes a different current user.
const pendingProof = new WeakMap<SupabaseClient, { key: string; promise: Promise<boolean>; userId?: string }>();

// Consume email proof explicitly. A pre-existing login alone is never proof of a
// recovery link. Token-hash templates work across devices without a PKCE verifier.
export async function consumeEmailSession(client: SupabaseClient, location: string, purpose: "invite" | "recovery") {
  const url = new URL(location);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.slice(1));
  if (query.get("error") || hash.get("error")) throw new Error("This email link is invalid, expired or already used. Request a new link.");
  const key = purpose + ":" + location;
  let operation = pendingProof.get(client);
  if (!operation || operation.key !== key) {
    operation = { key, promise: consumeProof(client, query, hash, purpose) };
    pendingProof.set(client, operation);
  }
  const emailProof = await operation.promise;
  if (purpose === "recovery" && !emailProof) throw new Error("Open the newest password-reset email to continue.");
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("Sign in to your existing account to accept this invitation, or open the newest invitation email.");
  if (emailProof && operation.userId && operation.userId !== user.id) throw new Error("This email link was verified for a different account. Open a new link.");
  if (emailProof) operation.userId = user.id;
  return { user, emailProof };
}

export function invitationSignInPath(location: string) {
  const url = new URL(location);
  const next = new URLSearchParams({ token: url.searchParams.get("token") ?? "", mode: "join" });
  return `/login?next=${encodeURIComponent(`/accept-invite?${next}`)}`;
}

async function consumeProof(client: SupabaseClient, query: URLSearchParams, hash: URLSearchParams, purpose: "invite" | "recovery") {
  let emailProof = false;
  if (query.get("token_hash")) {
    const type = query.get("type") as EmailOtpType | null;
    const allowed = purpose === "recovery" ? ["recovery"] : ["invite", "signup", "email", "magiclink"];
    if (!type || !allowed.includes(type)) throw new Error("This email link is for a different operation.");
    const { error } = await client.auth.verifyOtp({ token_hash: query.get("token_hash")!, type });
    if (error) throw new Error("This email link is invalid, expired or already used. Request a new link.");
    emailProof = true;
  } else if (query.get("code")) {
    const { error } = await client.auth.exchangeCodeForSession(query.get("code")!);
    if (error) throw new Error("This link could not be verified on this browser. Open it in the browser that requested it, or request a new link.");
    emailProof = true;
  } else if (hash.get("access_token") && hash.get("refresh_token")) {
    if (purpose === "recovery" && hash.get("type") !== "recovery") throw new Error("Open a password-recovery email to continue.");
    const { error } = await client.auth.setSession({ access_token: hash.get("access_token")!, refresh_token: hash.get("refresh_token")! });
    if (error) throw new Error("This email link is invalid or expired. Request a new link.");
    emailProof = true;
  }
  return emailProof;
}
