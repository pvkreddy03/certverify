"use client";

import { PortalNavigation } from "@/components/portal-navigation";
import { FormEvent, useRef, useState } from "react";
import { useEmailCooldown } from "@/lib/auth/email-cooldown";
import { isValidEmail, INVALID_EMAIL_MESSAGE } from "@/lib/auth/email-validation";
import { supabase } from "@/lib/supabase";
import { explainEmailError } from "@/lib/auth/email-errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const cooldown = useEmailCooldown("password-recovery");
  const sendingLock = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sendingLock.current || cooldown.disabled) return;
    setMessage("");
    setError("");
    if (!isValidEmail(email)) { setError(INVALID_EMAIL_MESSAGE); return; }
    sendingLock.current = true;
    setLoading(true);
    cooldown.start();
    try {
      // Use this preview's origin, not a Production URL, for reset links.
      const baseUrl = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${baseUrl}/reset-password` }
      );
      if (resetError) {
        setError(explainEmailError(resetError, "recovery"));
      } else {
        // Do not disclose which email addresses already have accounts.
        setMessage("If an account exists for that email, password-reset instructions have been requested. Check your inbox and spam folder.");
      }
    } catch {
      setError("Unable to request a password-reset email. Please retry later.");
    } finally {
      sendingLock.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <PortalNavigation />
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto flex min-h-[75vh] max-w-md items-center">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">C</div>
          <h1 className="mt-5 text-center text-2xl font-bold text-slate-900">Reset your password</h1>
          <p className="mt-2 text-center text-sm leading-6 text-slate-600">Enter the email address linked to your CertVerify account.</p>

          <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
                disabled={loading}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              />
            </div>
            {error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}
            {message && <div role="status" className="rounded-lg bg-green-50 p-4 text-sm leading-6 text-green-700">{message}</div>}
            <button type="submit" disabled={loading || cooldown.disabled} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Sending email..." : cooldown.disabled ? `Resend reset link in ${cooldown.remaining}s` : "Send reset link"}
            </button>
          </form>
          <a href="/login" className="mt-6 block text-center text-sm font-semibold text-blue-600 hover:text-blue-700">Back to sign in</a>
        </section>
      </div>
    </main>
    </>
  );
}
