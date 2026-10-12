"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { consumeEmailSession } from "@/lib/auth/email-session";

export default function ConfirmEmailPage() {
  const [message, setMessage] = useState("Confirming your email…");
  useEffect(() => {
    let cancelled = false;
    void consumeEmailSession(supabase, window.location.href, "invite").then(({ emailProof }) => {
      if (!emailProof) throw new Error("Email proof required");
      if (!cancelled) {
        window.history.replaceState({}, document.title, window.location.pathname);
        setMessage("Your email is confirmed. You can now continue to your dashboard.");
      }
    }).catch(() => {
      if (!cancelled) setMessage("This confirmation link is invalid or expired. Request a new confirmation email.");
    });
    return () => { cancelled = true; };
  }, []);
  return <main className="mx-auto max-w-lg p-8"><h1 className="text-2xl font-semibold">Email confirmation</h1><p role="status" className="my-6">{message}</p><a href="/dashboard" className="text-blue-700">Continue</a></main>;
}
