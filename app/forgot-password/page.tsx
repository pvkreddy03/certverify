"use client";

import { PortalNavigation } from "@/components/portal-navigation";
import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
import { explainEmailError } from "@/lib/auth/email-errors";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, "");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${baseUrl}/reset-password` }
    );

    setLoading(false);
    if (resetError) {
      setError(explainEmailError(resetError, "recovery"));
      return;
    }

    // Keep the response generic to avoid disclosing whether an email has an account.
    setMessage("If an account exists for that email, a password-reset email has been sent. Open the newest email to continue.");
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

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
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
            {error && <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>}
            {message && <div className="rounded-lg bg-green-50 p-4 text-sm leading-6 text-green-700">{message}</div>}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {loading ? "Sending email..." : "Send reset link"}
            </button>
          </form>
          <a href="/login" className="mt-6 block text-center text-sm font-semibold text-blue-600 hover:text-blue-700">Back to sign in</a>
        </section>
      </div>
    </main>
    </>
  );
}
