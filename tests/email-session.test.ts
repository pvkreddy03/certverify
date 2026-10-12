import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { consumeEmailSession, invitationSignInPath } from "../lib/auth/email-session";

function client() {
  const calls: string[] = [];
  const mock = { auth: {
    verifyOtp: async () => { calls.push("verify"); return { error: null }; },
    exchangeCodeForSession: async () => { calls.push("exchange"); return { error: null }; },
    setSession: async () => { calls.push("session"); return { error: null }; },
    getUser: async () => { calls.push("user"); return { data: { user: { id: "recipient" } }, error: null }; },
  } };
  return { calls, mock, supabase: mock as unknown as SupabaseClient };
}
test("ordinary login sessions cannot open password reset without email proof", async () => {
  const c = client();
  await assert.rejects(consumeEmailSession(c.supabase, "https://app.example/reset-password", "recovery"));
  assert.deepEqual(c.calls, []);
});
test("recovery rejects invitation proof and expired links", async () => {
  const c = client();
  await assert.rejects(consumeEmailSession(c.supabase, "https://app.example/reset-password?token_hash=test&type=invite", "recovery"));
  await assert.rejects(consumeEmailSession(c.supabase, "https://app.example/reset-password#error=access_denied", "recovery"));
  assert.deepEqual(c.calls, []);
});
test("token-hash recovery validates fresh proof before fetching the trusted user", async () => {
  const c = client();
  const result = await consumeEmailSession(c.supabase, "https://app.example/reset-password?token_hash=test&type=recovery", "recovery");
  assert.equal(result.emailProof, true);
  assert.deepEqual(c.calls, ["verify", "user"]);
});
test("PKCE code and implicit invitation links establish a session", async () => {
  const c = client();
  await consumeEmailSession(c.supabase, "https://app.example/accept-invite?code=example", "invite");
  await consumeEmailSession(c.supabase, "https://app.example/accept-invite#access_token=a&refresh_token=r&type=invite", "invite");
  assert.deepEqual(c.calls, ["exchange", "user", "session", "user"]);
});
test("existing users may authenticate with existing credentials before accepting", async () => {
  const c = client();
  const result = await consumeEmailSession(c.supabase, "https://app.example/accept-invite?token=app-token&mode=join", "invite");
  assert.equal(result.emailProof, false);
  assert.deepEqual(c.calls, ["user"]);
});
test("failed proof never falls back to an unrelated pre-existing session", async () => {
  const c = client();
  c.mock.auth.verifyOtp = async () => ({ error: new Error("expired") as never });
  await assert.rejects(consumeEmailSession(c.supabase, "https://app.example/reset-password?token_hash=test&type=recovery", "recovery"));
  assert.deepEqual(c.calls, []);
});

test("React effect replay consumes a one-time email token only once", async () => {
  const c = client();
  const location = "https://app.example/reset-password?token_hash=replay&type=recovery";
  await Promise.all([consumeEmailSession(c.supabase, location, "recovery"), consumeEmailSession(c.supabase, location, "recovery")]);
  assert.equal(c.calls.filter((call) => call === "verify").length, 1);
  assert.equal(c.calls.filter((call) => call === "user").length, 2);
});

test("credential-login links preserve invitation identity but exclude Auth tokens", () => {
  const link = invitationSignInPath("https://app.example/accept-invite?token=app-invitation&mode=setup&token_hash=auth-secret&code=pkce-secret#access_token=jwt-secret");
  const next = new URL(link, "https://app.example").searchParams.get("next")!;
  assert.equal(next, "/accept-invite?token=app-invitation&mode=join");
  for (const secret of ["auth-secret", "pkce-secret", "jwt-secret"]) assert.equal(link.includes(secret), false);
});
