"use client";

import { useState } from "react";
import { loginDestination } from "@/lib/auth/login-destination";
import { supabase } from "@/lib/supabase";
import { explainEmailError } from "@/lib/auth/email-errors";

export function LoginForm({ platform=false }: { platform?:boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [notice, setNotice] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setNotice("");
    setNeedsConfirmation(false);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setNeedsConfirmation(error.code === "email_not_confirmed");
      setMessage(error.code === "email_not_confirmed"
        ? explainEmailError(error, "confirmation")
        : error.message);
      return;
    }

    const requested = new URLSearchParams(window.location.search).get("next");
    const destination = loginDestination(requested,window.location.origin,platform);
    window.location.assign(destination);
  }

  async function handleResendConfirmation() {
    if (!email.trim()) return;
    setResending(true);
    setNotice("");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/confirm-email` },
    });
    setResending(false);
    setNotice(error
      ? explainEmailError(error, "confirmation")
      : "If confirmation is still needed, a new email has been requested. Please check your inbox and spam folder.");
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">

          <div className="mb-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
              C
            </div>

            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
              {platform ? "Platform administrator sign in" : "Welcome back"}
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              {platform ? "Authorized administrators only. MFA is required for platform access." : "Sign in to manage your professional certificates"}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">

            <form onSubmit={handleLogin} className="space-y-5">

              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="text-right">
                <a href="/forgot-password" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                  Forgot password?
                </a>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>

            </form>

            {message && (
              <div role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
                {message}
              </div>
            )}
            {needsConfirmation && (
              <button type="button" onClick={handleResendConfirmation} disabled={resending}
                className="mt-3 w-full rounded-lg border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60">
                {resending ? "Requesting confirmation..." : "Resend confirmation email"}
              </button>
            )}
            {notice && <p role="status" className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{notice}</p>}

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">OR</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <p className="text-center text-sm text-slate-600">
              Don&apos;t have an account?{" "}
              <a
                href="/signup"
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                Create an account
              </a>
            </p>

          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Your professional records are protected by CertVerify.
          </p>

        </div>
      </div>
    </main>
  );
}