"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [checking, setChecking] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkRecoverySession() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const authError = hash.get("error_description") || hash.get("error");
      if (authError) {
        if (!cancelled) {
          setError(
            hash.get("error_code") === "otp_expired"
              ? "This reset link has expired or has already been used. Request a new reset link."
              : `Could not verify this reset link: ${authError.replace(/\+/g, " ")}`
          );
          setChecking(false);
        }
        return;
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionError || !session?.user) {
        setError("This password-reset link is invalid or expired. Request a new one.");
        setChecking(false);
        return;
      }

      window.history.replaceState({}, document.title, window.location.pathname);
      setSessionReady(true);
      setChecking(false);
    }

    void checkRecoverySession();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password.length < 8) {
      setError("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage("Your password has been updated. You can now sign in with your new password.");
    await supabase.auth.signOut();
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12">
      <div className="mx-auto flex min-h-[75vh] max-w-md items-center">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">C</div>
          <h1 className="mt-5 text-center text-2xl font-bold text-slate-900">Choose a new password</h1>

          {checking && <p className="mt-6 text-center text-sm text-slate-600">Verifying your reset link...</p>}

          {!checking && sessionReady && !message && (
            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">New password</label>
                <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required disabled={saving} className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100" />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700">Confirm new password</label>
                <input id="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} required disabled={saving} className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100" />
              </div>
              <button type="submit" disabled={saving} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saving ? "Updating password..." : "Update password"}</button>
            </form>
          )}

          {error && <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm leading-6 text-red-700">{error}</div>}
          {message && <div className="mt-6 rounded-lg bg-green-50 p-4 text-sm leading-6 text-green-700">{message}</div>}
          {!checking && (
            <a href={message ? "/login" : "/forgot-password"} className="mt-6 block text-center text-sm font-semibold text-blue-600 hover:text-blue-700">
              {message ? "Go to sign in" : "Request another reset link"}
            </a>
          )}
        </section>
      </div>
    </main>
  );
}
