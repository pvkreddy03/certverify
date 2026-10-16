"use client";

import { useEffect, useState } from "react";

export const EMAIL_RESEND_SECONDS = 60;

function remainingFor(key: string) {
  try {
    const until = Number(window.sessionStorage.getItem("certverify:email-cooldown:" + key) ?? "0");
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch { return 0; }
}

export function useEmailCooldown(key: string) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    // Browser tab only: prevents double-clicking and survives a page refresh.
    // Supabase's server-side throttling remains authoritative.
    const refresh = () => setRemaining(remainingFor(key));
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, [key]);

  function start() {
    try { window.sessionStorage.setItem("certverify:email-cooldown:" + key, String(Date.now() + EMAIL_RESEND_SECONDS * 1000)); }
    catch { /* Storage may be disabled; the current-page button is still disabled by state. */ }
    setRemaining(EMAIL_RESEND_SECONDS);
  }
  return { remaining, start, disabled: remaining > 0 };
}
