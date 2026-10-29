"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { PortalNavigation } from "@/components/portal-navigation";
import { useEmailCooldown } from "@/lib/auth/email-cooldown";
import { isValidEmail, INVALID_EMAIL_MESSAGE } from "@/lib/auth/email-validation";
import { explainEmailError } from "@/lib/auth/email-errors";
import { formatMoney } from "@/lib/billing/money";
import type { CatalogPlan } from "@/lib/billing/types";
import { supabase } from "@/lib/supabase";

type PublicOffer = {
  name: string;
  code: string;
  kind: "percentage" | "fixed" | "intro_price" | "free_trial";
  value: number;
  cycles: number;
  trial_days: number;
  currency: string | null;
  currency_exponent: number;
  ends_at: string | null;
};
type LoginInformation = {
  plans: CatalogPlan[];
  offers: PublicOffer[];
  contact: { support_email?: string; support_phone?: string; website_url?: string; help_text?: string };
};

function offerText(offer: PublicOffer) {
  if (offer.kind === "free_trial") return `${offer.trial_days}-day trial`;
  if (offer.kind === "percentage") return `${offer.value / 100}% discount`;
  if (offer.kind === "fixed" || offer.kind === "intro_price") {
    if (!offer.currency) return offer.name;
    const value = formatMoney(offer.value, offer.currency, offer.currency_exponent);
    return offer.kind === "fixed" ? `${value} discount` : `${value} introductory price`;
  }
  return offer.name;
}

function LoginHighlights() {
  const [info, setInfo] = useState<LoginInformation | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/public/login-info", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as LoginInformation;
      })
      .then((data) => { if (active) setInfo(data); })
      .catch(() => { /* A public catalog outage must not block login. */ });
    return () => { active = false; };
  }, []);

  if (!info) return null;
  const plans = Array.isArray(info.plans) ? info.plans : [];
  const offers = Array.isArray(info.offers) ? info.offers : [];
  const contact = info.contact ?? {};
  const hasContact = Boolean(contact.support_email || contact.support_phone || contact.website_url || contact.help_text);
  if (!plans.length && !offers.length && !hasContact) return null;

  return (
    <aside aria-label="Current plans, limited offers and contact" className="space-y-5 lg:pt-16">
      {plans.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Current CertVerify plans</h2>
        <div className="mt-4 max-h-96 space-y-3 overflow-auto">
          {plans.map((plan) => <div key={plan.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-900">{plan.terms.name}</h3>
            <p className="mt-1 font-bold text-blue-700">{formatMoney(plan.terms.price_minor, plan.terms.currency, plan.terms.currency_exponent)} / {plan.terms.billing_period}</p>
            {plan.terms.description && <p className="mt-1 text-sm text-slate-600">{plan.terms.description}</p>}
            <p className="mt-2 text-xs text-slate-600">{plan.terms.certificate_limit === null ? "Unlimited certificates" : `${plan.terms.certificate_limit} certificates`} · {plan.terms.included_seats} included seat(s)</p>
          </div>)}
        </div>
        <Link href="/signup" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline">Create account to explore plans</Link>
      </section>}
      {offers.length > 0 && <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="text-lg font-bold text-blue-950">Current limited offers</h2>
        <div className="mt-3 space-y-3">
          {offers.map((offer) => <div key={offer.code} className="rounded-xl bg-white p-4">
            <p className="font-semibold text-slate-900">{offer.name}</p>
            <p className="mt-1 text-sm text-blue-800">{offerText(offer)}</p>
            <p className="mt-1 text-xs text-slate-600">Promo code: <span className="font-semibold">{offer.code}</span></p>
            {offer.ends_at && <p className="mt-1 text-xs text-slate-500">Ends {new Date(offer.ends_at).toLocaleDateString("en-IN")}</p>}
          </div>)}
        </div>
        <p className="mt-3 text-xs text-slate-600">Subject to the offer&apos;s eligibility and checkout terms.</p>
      </section>}
      {hasContact && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Contact CertVerify</h2>
        <div className="mt-3 space-y-2 text-sm text-slate-700">
          {contact.support_email && <p>Email: <a className="break-all font-medium text-blue-700 hover:underline" href={`mailto:${contact.support_email}`}>{contact.support_email}</a></p>}
          {contact.support_phone && <p>Phone: <a className="font-medium text-blue-700 hover:underline" href={`tel:${contact.support_phone.replace(/[^\d+]/g, "")}`}>{contact.support_phone}</a></p>}
          {contact.website_url && <p>Help: <a className="break-all font-medium text-blue-700 hover:underline" href={contact.website_url} target="_blank" rel="noopener noreferrer">Visit help website</a></p>}
          {contact.help_text && <p className="whitespace-pre-wrap">{contact.help_text}</p>}
        </div>
      </section>}
    </aside>
  );
}

export function LoginForm({ platform = false }: { platform?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const inFlight = useRef(false);
  const resendLock = useRef(false);
  const cooldown = useEmailCooldown("signup-confirmation");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    setMessage("");
    setNotice("");
    setNeedsConfirmation(false);
    if (!isValidEmail(email)) { setMessage(INVALID_EMAIL_MESSAGE); return; }
    inFlight.current = true;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        setNeedsConfirmation(error.code === "email_not_confirmed");
        setMessage(error.code === "email_not_confirmed"
          ? explainEmailError(error, "confirmation")
          : "Email or password is incorrect. Please check your credentials.");
        return;
      }
      // A fresh server request checks the current authenticated role before
      // deciding which portal to open. The platform still enforces MFA.
      const requested = new URLSearchParams(window.location.search).get("next");
      const landing = new URL("/auth/landing", window.location.origin);
      if (requested) landing.searchParams.set("next", requested);
      window.location.assign(landing.pathname + landing.search);
    } catch {
      setMessage("Unable to sign in. Please try again.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }

  async function handleResendConfirmation() {
    if (resendLock.current || cooldown.disabled) return;
    if (!isValidEmail(email)) { setNotice(INVALID_EMAIL_MESSAGE); return; }
    resendLock.current = true;
    setResending(true);
    setNotice("");
    cooldown.start();
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo: `${window.location.origin}/confirm-email` },
      });
      setNotice(error
        ? explainEmailError(error, "confirmation")
        : "If confirmation is still needed, check your inbox and spam folder for the newest email.");
    } catch {
      setNotice("Unable to request confirmation. Please try again later.");
    } finally {
      resendLock.current = false;
      setResending(false);
    }
  }

  return (
    <>
      {platform && <PortalNavigation portal="platform" />}
      <main className="cv-page">
        <div className={`cv-shell grid min-h-[84vh] items-start gap-10 pt-12 ${platform ? "!max-w-lg" : "lg:grid-cols-2"}`}>
          <div className="w-full max-w-md justify-self-center">
            <div className="mb-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#153753] to-[#0b8d82] text-xl font-extrabold text-white shadow-[0_12px_30px_rgba(15,125,116,.23)]">✓</div>
              <p className="cv-eyebrow mt-6 justify-center">SECURE ACCESS</p><h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#182d47]">{platform ? "Platform administrator sign in" : "Welcome back"}</h1>
              <p className="mt-2 text-sm text-slate-600">{platform ? "Authorized administrators only. MFA is required for platform access." : "Sign in to manage your professional certificates"}</p>
            </div>
            <div className="cv-card p-7 sm:p-9">
              <form onSubmit={handleLogin} noValidate className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email address</label>
                  <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" required maxLength={254} className="cv-field mt-2"/>
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
                  <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password" required className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"/>
                </div>
                <div className="text-right"><Link href="/forgot-password" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Forgot password?</Link></div>
                <button type="submit" disabled={loading} className="cv-primary w-full disabled:opacity-60">{loading ? "Signing in..." : "Sign in"}</button>
              </form>
              {message && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{message}</p>}
              {needsConfirmation && <button type="button" onClick={handleResendConfirmation} disabled={resending || cooldown.disabled}
                className="mt-3 w-full rounded-lg border border-blue-200 px-4 py-3 text-sm font-semibold text-blue-700 disabled:opacity-50">
                {resending ? "Requesting confirmation..." : cooldown.disabled ? `Resend confirmation in ${cooldown.remaining}s` : "Resend confirmation email"}
              </button>}
              {notice && <p role="status" className="mt-3 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{notice}</p>}
              {!platform && <><div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-slate-200"/><span className="text-xs text-slate-400">OR</span><div className="h-px flex-1 bg-slate-200"/></div>
                <p className="text-center text-sm text-slate-600">Don&apos;t have an account? <Link href="/signup" className="font-semibold text-blue-600 hover:text-blue-700">Create an account</Link></p></>}
            </div>
            <div className="mt-6 flex items-center justify-center gap-2 text-center text-xs font-medium text-[#6b8393]">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 2 4 5v7c0 5.4 3.5 8.6 8 10 4.5-1.4 8-4.6 8-10V5Z"/><path d="m9 12 2 2 4-4"/></svg>
              Your professional records are protected by CertVerify.
            </div>
          </div>
          {!platform && <LoginHighlights />}
        </div>
      </main>
    </>
  );
}
