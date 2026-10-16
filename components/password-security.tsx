"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useEmailCooldown } from "@/lib/auth/email-cooldown";
import { explainEmailError } from "@/lib/auth/email-errors";

/** Passwords stay only in this form and are never sent to a CertVerify API. */
export function PasswordSecurity() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [working, setWorking] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [resetFeedback, setResetFeedback] = useState("");
  const lock = useRef(false);
  const resetLock = useRef(false);
  const cooldown = useEmailCooldown("password-recovery");

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    setFeedback("");
    if (newPassword.length < 8) { setFeedback("Choose a password with at least 8 characters."); return; }
    if (newPassword !== confirmation) { setFeedback("The passwords do not match."); return; }
    lock.current = true;
    setWorking(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setFeedback(error.message.includes("reauth") || error.message.includes("nonce")
          ? "Reauthentication is required. Use the email reset option below."
          : "Could not change your password. Try the email reset option below.");
      } else {
        setFeedback("Password updated successfully. You can use your new password the next time you sign in.");
        setNewPassword("");
        setConfirmation("");
      }
    } catch {
      setFeedback("Password change is temporarily unavailable. Try the email reset option below.");
    } finally {
      setWorking(false);
      lock.current = false;
    }
  }

  async function requestReset() {
    if (sending || resetLock.current || cooldown.disabled) return;
    resetLock.current = true;
    setSending(true);
    setResetFeedback("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user?.email) throw new Error("Account email unavailable");
      cooldown.start();
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setResetFeedback(error
        ? explainEmailError(error, "recovery")
        : "A password-reset link has been requested for your registered email. Check your inbox and spam folder.");
    } catch {
      setResetFeedback("Could not send a reset email. Please use Forgot password from the login page.");
    } finally {
      setSending(false);
      resetLock.current = false;
    }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-semibold text-slate-900">Password and recovery</h2>
    <p className="mt-2 text-sm text-slate-600">Change your sign-in password, or request an email reset if you forgot it or joined by an email link.</p>
    <form onSubmit={changePassword} className="mt-5 space-y-4">
      <label className="block text-sm font-medium">
        New password
        <input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)}
          minLength={8} required disabled={working} className="mt-2 w-full rounded-lg border px-4 py-3" />
      </label>
      <label className="block text-sm font-medium">
        Confirm new password
        <input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)}
          minLength={8} required disabled={working} className="mt-2 w-full rounded-lg border px-4 py-3" />
      </label>
      <button type="submit" disabled={working} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60">
        {working ? "Updating…" : "Change password"}
      </button>
      {feedback && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm">{feedback}</p>}
    </form>
    <div className="mt-6 border-t pt-5">
      <h3 className="font-semibold">Forgot your password?</h3>
      <p className="mt-2 text-sm text-slate-600">Send a verified reset link to the email associated with this account.</p>
      <button type="button" disabled={sending || cooldown.disabled} onClick={() => void requestReset()}
        className="mt-3 rounded-lg border border-blue-200 px-5 py-3 font-semibold text-blue-800 disabled:opacity-60">
        {sending ? "Requesting…" : cooldown.disabled ? `Retry in ${cooldown.remaining}s` : "Email me a reset link"}
      </button>
      {resetFeedback && <p role="status" className="mt-3 rounded-lg bg-slate-100 p-3 text-sm">{resetFeedback}</p>}
      <p className="mt-3 text-xs text-slate-500">If you cannot access this page, use <Link href="/forgot-password" className="font-semibold text-blue-700 underline">Forgot password</Link> on the sign-in screen.</p>
    </div>
  </section>;
}
