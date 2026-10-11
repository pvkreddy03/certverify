"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export default function AcceptInvitePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<"setup" | "join">("setup");
  const [tokenHash, setTokenHash] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInvitationSession() {
      setLoading(true);
      setError("");

      const params = new URLSearchParams(window.location.search);
      const rawToken = params.get("token") ?? "";
      const requestedMode = params.get("mode") === "join" ? "join" : "setup";
      const authHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const authError = authHash.get("error_description") || authHash.get("error");

      if (authError) {
        if (!cancelled) {
          setError(
            authHash.get("error_code") === "otp_expired"
              ? "This email link has expired or has already been used. Ask your organization admin to resend the invitation, then open the newest email."
              : `We could not verify this invitation. ${authError.replace(/\+/g, " ")} Ask your organization admin to resend it if needed.`
          );
          setLoading(false);
        }
        return;
      }

      if (!rawToken || rawToken.length < 32) {
        if (!cancelled) {
          setError("This invitation link is incomplete. Ask your organization admin to resend the invitation.");
          setLoading(false);
        }
        return;
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionError || !session?.user) {
        setError("We could not verify your sign-in session. Open the newest invitation email again or sign in and ask your admin to resend it.");
        setLoading(false);
        return;
      }

      const hash = await sha256(rawToken);
      if (cancelled) return;

      setEmail(session.user.email ?? "");
      setMode(requestedMode);
      setTokenHash(hash);

      // The raw invitation token is only needed once to derive its hash.
      // Remove it and the auth tokens from the visible browser URL.
      window.history.replaceState({}, document.title, window.location.pathname);
      setLoading(false);
    }

    void loadInvitationSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!tokenHash) {
      setError("The invitation token is missing. Ask your organization admin to resend it.");
      return;
    }

    if (mode === "setup") {
      if (password.length < 8) {
        setError("Choose a password with at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }
    }

    setSaving(true);

    if (mode === "setup") {
      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) {
        setSaving(false);
        setError(passwordError.message);
        return;
      }
    }

    const { data, error: invitationError } = await supabase.rpc(
      "accept_account_invitation",
      { p_token_hash: tokenHash }
    );

    if (invitationError || data !== true) {
      setSaving(false);
      setError(
        invitationError?.message ||
          "The invitation could not be accepted. It may have expired or been revoked. Ask your organization admin to resend it."
      );
      return;
    }

    setMessage("Your invitation has been accepted. Redirecting to your dashboard...");
    window.setTimeout(() => {
      window.location.assign("/dashboard");
    }, 900);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto flex min-h-[75vh] max-w-md items-center">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
            C
          </div>
          <h1 className="mt-5 text-center text-2xl font-bold text-slate-900">
            {mode === "join" ? "Join your organization" : "Set up your CertVerify account"}
          </h1>
          <p className="mt-2 text-center text-sm text-slate-600">
            {loading
              ? "Verifying your invitation..."
              : email
                ? `Invitation for ${email}`
                : "Complete the steps below to continue."}
          </p>

          {loading && (
            <div className="mt-7 flex justify-center">
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            </div>
          )}

          {!loading && error && (
            <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm leading-6 text-red-700">
              {error}
              <p className="mt-2">
                If you still have the invitation email, use the newest invitation link. Otherwise, contact your organization admin and ask them to resend it.
              </p>
            </div>
          )}

          {!loading && email && tokenHash && (
            <form onSubmit={handleAccept} className="mt-7 space-y-5">
              {mode === "setup" && (
                <>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                      Create password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      disabled={saving}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">
                      Confirm password
                    </label>
                    <input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      disabled={saving}
                      className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                    />
                  </div>
                </>
              )}

              {mode === "join" && (
                <div className="rounded-lg bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                  You are signed in with your existing CertVerify account. Accept the invitation to join this organization without creating another account.
                </div>
              )}

              {error && (
                <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
              )}
              {message && (
                <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">{message}</div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Accepting invitation..."
                  : mode === "join"
                    ? "Accept invitation"
                    : "Create account and accept"}
              </button>
            </form>
          )}

          {!loading && !email && (
            <a href="/login" className="mt-6 block rounded-lg bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700">
              Go to sign in
            </a>
          )}

          <p className="mt-6 text-center text-xs text-slate-400">
            Your professional records are protected by CertVerify.
          </p>
        </section>
      </div>
    </main>
  );
}
