"use client";

import { PortalNavigation } from "@/components/portal-navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { explainEmailError } from "@/lib/auth/email-errors";

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setAwaitingConfirmation(false);
    if (name.trim().length < 2 || name.trim().length > 120 || password.length < 8) {
      setMessage("Enter a name of 2–120 characters and a password of at least 8 characters.");
      return;
    }
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/confirm-email`,
        data: {
          professional_name: name.trim(),
        },
      },
    });

    setLoading(false);

    if (error) {
      setMessage(explainEmailError(error, "signup"));
      return;
    }

    setAwaitingConfirmation(true);
    setMessage(
      "Account created successfully. Please check your email to confirm your account."
    );
  }

  async function handleResendConfirmation() {
    if (!email.trim()) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/confirm-email` },
    });
    setResending(false);
    setMessage(error
      ? explainEmailError(error, "confirmation")
      : "If confirmation is still needed, a new email has been requested. Please check your inbox and spam folder.");
  }

  return (
    <>
      <PortalNavigation />
    <main className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">

          <div className="mb-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
              C
            </div>

            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
              Create your account
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              Start securing your professional certificates
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">

            <form onSubmit={handleSignup} className="space-y-5">

              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-slate-700"
                >
                  Professional / Business Name
                </label>

                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name or business name"
                  required
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

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
                  placeholder="Create a password"
                  required
                  minLength={8}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Create account"}
              </button>

            </form>

            {message && (
              <div role="status" className="mt-5 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">
                {message}
              </div>
            )}
            {awaitingConfirmation && (
              <button type="button" onClick={handleResendConfirmation} disabled={resending}
                className="mt-3 w-full rounded-lg border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60">
                {resending ? "Requesting confirmation..." : "Resend confirmation email"}
              </button>
            )}

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">OR</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <p className="text-center text-sm text-slate-600">
              Already have an account?{" "}
              <a
                href="/login"
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                Sign in
              </a>
            </p>

          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            Your professional records are protected by CertVerify.
          </p>

        </div>
      </div>
    </main>
    </>
  );
}