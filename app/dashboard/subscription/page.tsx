"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { brandingFetch } from "@/lib/branding/client";
import { PaymentSimulation } from "@/components/payment-simulation";
import { formatMoney } from "@/lib/billing/money";
import type { CatalogPlan, Quote, SubscriptionStatus } from "@/lib/billing/types";

type Report = { subscription: SubscriptionStatus; plans: CatalogPlan[] };
type TestCheckoutStatus = {
  mode: "disabled" | "incomplete" | "razorpay_test";
  configured: boolean;
  testOnly: true;
  livePaymentsEnabled: false;
  message: string;
};

function Icon({ name, className = "h-5 w-5" }: { name: "card" | "check" | "sparkle" | "arrow" | "receipt" | "shield" | "users" | "calendar"; className?: string }) {
  const paths = {
    card: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    sparkle: <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"/><path d="m19 17 .6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6z"/></>,
    arrow: <><path d="M4 12h16M13 5l7 7-7 7"/></>,
    receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8M8 12h8"/></>,
    shield: <><path d="m12 2 8 4v6c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 4 5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18"/></>,
  };
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function money(minor: number, currency: string, exponent: number) {
  return formatMoney(minor, currency, exponent);
}

function readablePeriod(value: CatalogPlan["terms"]["billing_period"], days: number) {
  if (value === "monthly") return "month";
  if (value === "annual") return "year";
  return days === 1 ? "day" : days + " days";
}

function date(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SubscriptionPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [planId, setPlanId] = useState("");
  const [seats, setSeats] = useState(1);
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteNonce, setQuoteNonce] = useState("");
  const [quotePlanId, setQuotePlanId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkoutStatus, setCheckoutStatus] = useState<TestCheckoutStatus | null>(null);

  useEffect(() => {
    let active = true;
    void brandingFetch("/api/billing").then((data: Report) => {
      if (!active) return;
      setReport(data);
      // Return from Team Management with the current plan selected and one extra
      // seat prefilled. This only prepares a quotation; it never charges or activates.
      const fromTeam = new URLSearchParams(window.location.search).get("addSeats") === "1";
      const first = (fromTeam
        ? data.plans.find(p => p.id === data.subscription.period?.plan_id &&
            p.terms.eligibility.includes(data.subscription.account_type))
        : undefined) ?? data.plans.find(p => p.terms.eligibility.includes(data.subscription.account_type));
      setPlanId(first?.id ?? "");
      const minimumSeats = Math.max(first?.terms.included_seats ?? 1, data.subscription.allocated_seats);
      const requestedSeats = fromTeam ? Math.max(minimumSeats, (data.subscription.period?.licensed_seats ?? 0) + 1) : minimumSeats;
      setSeats(first?.terms.max_seats === null || first?.terms.max_seats === undefined
        ? requestedSeats : Math.min(requestedSeats,first.terms.max_seats));
      if (fromTeam) setMessage("Add more team seats: review the licensed-user count, get a quotation, and confirm only if the terms are suitable. Seats become usable only after the updated subscription takes effect.");
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : "Could not load plans.");
    }).finally(() => { if (active) setLoading(false); });
    void brandingFetch("/api/payments/status")
      .then((status: TestCheckoutStatus) => { if (active) setCheckoutStatus(status); })
      .catch(() => { /* Checkout readiness must not hide plan selection. */ });
    return () => { active = false; };
  }, []);

  const s = report?.subscription;
  const eligible = useMemo(() => report?.plans.filter(p => p.terms.eligibility.includes(report.subscription.account_type)) ?? [], [report]);
  const chosen = eligible.find(p => p.id === planId);

  function selectPlan(plan: CatalogPlan) {
    setPlanId(plan.id);
    setSeats(Math.max(plan.terms.included_seats, s?.allocated_seats ?? 1));
    setQuote(null);
    setMessage("");
  }

  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await brandingFetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (body.action === "quote") {
        setQuote(result as Quote);
        setQuoteNonce(crypto.randomUUID());
        setQuotePlanId(planId);
        setMessage("Your quotation is ready. Review the price and terms before confirming.");
      } else {
        setQuote(null);
        setReport(await brandingFetch("/api/billing") as Report);
        setMessage(result.status === "awaiting_payment"
          ? checkoutStatus?.configured
            ? "Subscription request saved. Open My Orders to continue the test checkout. Access activates only after verified payment."
            : "Selection saved awaiting verified payment. Payment collection is not enabled; no charge or paid access activation occurred."
          : result.status === "scheduled"
            ? "Your change is scheduled for the next billing period; existing access remains unchanged."
            : "Subscription action completed and audited.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Subscription action failed.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="cv-page min-h-screen">
    <div className="mx-auto max-w-6xl space-y-7 px-4 py-7 sm:px-6 sm:py-10">
      <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0d1b32] via-[#123c50] to-[#0b6967] p-6 text-white shadow-[0_18px_40px_rgba(7,45,65,.14)] sm:p-9">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full border border-white/15 bg-white/5"/>
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 right-36 h-72 w-72 rounded-full border border-white/10"/>
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.18em] text-[#8bf4e3]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"><Icon name="card"/></span>
              CertVerify membership
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">A plan that works for you.</h1>
            <p className="text-sm leading-6 text-[#d7f3ef] sm:text-base">Pick what fits your practice. Your certificate records, QR verification and organization workspace stay together as you grow.</p>
          </div>
          <Link href="/dashboard/subscription/orders"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/30 bg-white/15 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/25">
            <Icon name="receipt" className="h-5 w-5"/>My Orders<Icon name="arrow" className="h-4 w-4"/>
          </Link>
        </div>
      </header>

      {s?.can_manage && new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("addSeats") === "1" && <section aria-label="Add team seats" className="rounded-2xl border border-teal-200 bg-[#edfbf7] p-5">
        <h2 className="text-lg font-extrabold text-[#143b48]">Add licensed team seats</h2>
        <p className="mt-2 text-sm text-[#4a6770]">Choose the number of seats below. The exact additional charge is calculated from your subscription plan and shown before you confirm. A scheduled change does not unlock extra invitations until the new billing period begins.</p>
        <Link href="/dashboard/team" className="mt-3 inline-flex text-sm font-bold text-teal-800 underline">← Back to Team Management</Link>
      </section>}
      <nav aria-label="Subscription sections" className="flex gap-2 border-b border-slate-200 pb-2 text-sm font-semibold">
        <span aria-current="page" className="rounded-xl bg-[#113c4f] px-5 py-3 text-white">Plans &amp; subscription</span>
        <Link className="rounded-xl px-5 py-3 text-slate-600 hover:bg-slate-100" href="/dashboard/subscription/orders">My Orders</Link>
      </nav>

      {message && <div role="status" className="rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm font-medium text-teal-950">{message}</div>}
      {loading && <div className="cv-panel p-9 text-slate-600" role="status">Finding your account plans…</div>}

      {s && <>
        <section className="grid gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(270px,1fr)]">
          <div className="cv-panel rounded-3xl p-6 sm:p-7">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e3f7f2] text-[#0c746c]"><Icon name="shield" className="h-6 w-6"/></div>
              <div className="flex-1">
                <p className="text-xs font-bold uppercase tracking-[.13em] text-slate-500">Your membership</p>
                <h2 className="text-xl font-bold tracking-tight text-[#162e43]">Current subscription — {s.status}</h2>
              </div>
              <span className={"rounded-full px-3 py-1.5 text-xs font-bold " + (s.entitled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900")}>
                {s.entitled ? "Access enabled" : "Action needed"}
              </span>
            </div>
            <p className="mt-5 text-xl font-bold text-[#1c3748]">{s.period?.name ?? "No activated subscription"}</p>
            <p className="mt-2 text-sm text-slate-600">New certificate issuance: {s.entitled ? "Eligible subject to quota" : "Unavailable until subscription activation or renewal"}</p>
            {s.period && <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#f3f8fa] p-4">
                <p className="text-xs text-slate-500">Certificate usage</p>
                <p className="mt-1 text-lg font-bold text-[#163449]">{s.period.certificates_created} / {s.period.certificate_limit ?? "Unlimited"}</p>
                <p className="mt-1 text-xs text-slate-600">Remaining certificates: {s.period.remaining_certificates ?? "Unlimited"}</p>
              </div>
              <div className="rounded-2xl bg-[#f3f8fa] p-4">
                <p className="text-xs text-slate-500">Billing period ends</p>
                <p className="mt-1 text-lg font-bold text-[#163449]">{date(s.period.ends_at)}</p>
                <p className="mt-1 text-xs text-slate-600">{s.period.licensed_seats} licensed seats</p>
              </div>
            </div>}
            <p className="mt-4 text-xs leading-5 text-slate-500">Your existing certificates remain verifiable. QR scans never use up certificate creation quota.</p>
          </div>
          <div className="rounded-3xl border border-[#cdeee6] bg-[#ecfbf7] p-6 sm:p-7">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0d857a] shadow-sm"><Icon name="sparkle" className="h-6 w-6"/></div>
            <h2 className="mt-4 text-xl font-extrabold text-[#163a40]">Everything in one workspace.</h2>
            <p className="mt-2 text-sm leading-6 text-[#406769]">Choose the level of service you need. Your team, issued certificates and verification links belong to the same organization.</p>
            <div className="mt-5 space-y-2 text-sm font-medium text-[#225d58]">
              <p className="flex items-center gap-2"><Icon name="check" className="h-4 w-4"/>Secure public verification</p>
              <p className="flex items-center gap-2"><Icon name="check" className="h-4 w-4"/>Clear subscription terms</p>
              <p className="flex items-center gap-2"><Icon name="check" className="h-4 w-4"/>Your order history in one place</p>
            </div>
          </div>
        </section>

        <section className="space-y-4" aria-label="Choose or change a subscription">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#078b80]">Explore plans</p>
              <h2 className="mt-1 text-2xl font-extrabold text-[#142f43]">Choose or change a subscription</h2>
              <p className="mt-2 text-sm text-slate-600">Transparent prices, simple choices. Select a card to review your subscription.</p>
            </div>
            <Link href="/dashboard/subscription/orders" className="text-sm font-semibold text-[#0c776f] underline underline-offset-4">View previous subscriptions &amp; payments</Link>
          </div>

          {eligible.length === 0 ? <div className="cv-panel rounded-3xl border-amber-200 p-7">
            <h3 className="text-lg font-bold text-[#253e50]">No plans are currently available for this account</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">Plans must be activated and marked visible by the CertVerify platform administrator, and their availability dates must include today. Your account and existing documents are unaffected.</p>
            <p className="mt-3 text-sm font-medium text-amber-800">Please contact CertVerify support for available subscription plans. No payment can be requested until a plan is published.</p>
            {s.can_manage && s.period && <button type="button" disabled={busy}
              onClick={() => void act({ action: "quote", planId: s.period!.plan_id, seats: s.period!.licensed_seats, coupon, intent: "renewal" })}
              className="mt-5 rounded-xl bg-[#0e746c] px-5 py-3 text-sm font-bold text-white hover:bg-[#095e56] disabled:opacity-50">
              Quote renewal at agreed price
            </button>}
          </div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {eligible.map(plan => {
              const selected = plan.id === planId;
              const t = plan.terms;
              return <button key={plan.id} type="button" aria-pressed={selected} onClick={() => selectPlan(plan)} disabled={!s.can_manage || busy}
                className={"group relative flex min-h-80 flex-col rounded-3xl border-2 p-6 text-left transition disabled:cursor-not-allowed disabled:opacity-70 " +
                  (selected ? "border-[#0aa89b] bg-white shadow-[0_14px_35px_rgba(0,126,112,.13)]" : "border-[#e2eaf0] bg-white shadow-sm hover:border-[#a4d6d1] hover:shadow-md")}>
                <div className="flex w-full items-start justify-between gap-3">
                  <span className={"flex h-12 w-12 items-center justify-center rounded-2xl " + (selected ? "bg-[#d7f7ee] text-[#0b8679]" : "bg-[#edf2f5] text-[#4f7381]")}><Icon name={t.audience === "enterprise" ? "users" : "sparkle"} className="h-6 w-6"/></span>
                  <span className={"rounded-full px-3 py-1 text-xs font-bold " + (selected ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-500")}>{selected ? "Selected" : "Choose plan"}</span>
                </div>
                <h3 className="mt-5 text-xl font-extrabold text-[#173246]">{t.name}</h3>
                <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">{t.description || "Professional certificate services tailored to your workflow."}</p>
                <div className="mt-5 flex flex-wrap items-baseline gap-1">
                  <span className="text-3xl font-extrabold tracking-tight text-[#102e40]">{money(t.price_minor, t.currency, t.currency_exponent)}</span>
                  <span className="text-sm text-slate-500">/ {readablePeriod(t.billing_period, t.custom_days)}</span>
                </div>
                <div className="mt-5 h-px w-full bg-slate-100"/>
                <div className="mt-4 flex-1 space-y-3 text-sm text-[#355161]">
                  <p className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[#059987]"/>{t.certificate_limit === null ? "Unlimited certificates per period" : t.certificate_limit + " certificates per period"}</p>
                  <p className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[#059987]"/>{t.included_seats} user seat{t.included_seats !== 1 ? "s" : ""} included</p>
                  {t.features.slice(0, 4).map(feature => <p key={feature} className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-[#059987]"/>{feature}</p>)}
                </div>
                <span className={"mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold " + (selected ? "bg-[#0e746c] text-white" : "bg-[#eff6f7] text-[#245061]")}>{selected ? "Plan selected" : "Choose " + t.name} <Icon name="arrow" className="h-4 w-4"/></span>
              </button>;
            })}
          </div>}

          {s.can_manage && chosen && <div className="cv-panel rounded-3xl p-6 sm:p-8" id="plan-checkout">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.15em] text-[#088e80]">Next step</p>
                <h3 className="mt-1 text-xl font-extrabold text-[#19384a]">Personalize your {chosen.terms.name} plan</h3>
              </div>
              <span className="rounded-xl bg-[#e9faf4] px-4 py-2 text-sm font-semibold text-[#187b6f]">No payment until confirmation</span>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-[#345265]">
                Licensed user seats
                <input type="number" min={Math.max(1, chosen.terms.included_seats)} max={chosen.terms.max_seats ?? 10000}
                  value={seats} onChange={event => { setSeats(Number(event.target.value)); setQuote(null); }}
                  className="cv-field mt-2" />
                <span className="mt-1 block text-xs font-normal text-slate-500">{chosen.terms.included_seats} included; extra seats priced in the quotation. If your selected plan has reached its maximum, choose a higher-capacity plan or contact support.</span>
              </label>
              <label className="block text-sm font-semibold text-[#345265]">
                Have an offer code?
                <input value={coupon} maxLength={40} onChange={event => { setCoupon(event.target.value); setQuote(null); }}
                  className="cv-field mt-2" placeholder="Optional coupon code" />
                <span className="mt-1 block text-xs font-normal text-slate-500">Eligible discounts are calculated securely.</span>
              </label>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" disabled={busy || !planId} onClick={() => void act({
                action: "quote", planId, seats, coupon, intent: s.period ? "change" : "start",
              })} className="cv-primary flex items-center gap-2 disabled:opacity-50">
                Get subscription quote <Icon name="arrow" className="h-4 w-4"/>
              </button>
              <button type="button" disabled={busy || !planId || s.trial_used || s.entitled} onClick={() => void act({
                action: "quote", planId, seats, coupon, intent: "trial",
              })} className="rounded-xl border border-[#bfd6dc] bg-white px-5 py-3 text-sm font-bold text-[#245265] disabled:opacity-50">
                Request free trial quote
              </button>
              {s.period && <button type="button" disabled={busy} onClick={() => void act({
                action: "quote", planId: s.period!.plan_id, seats: s.period!.licensed_seats, coupon, intent: "renewal",
              })} className="rounded-xl border border-[#bfd6dc] bg-white px-5 py-3 text-sm font-bold text-[#245265] disabled:opacity-50">
                Quote renewal at agreed price
              </button>}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Subscription changes and seats follow the server-calculated quotation. Changes may take effect at the next billing boundary. No live checkout is enabled in the test environment.</p>
          </div>}

          {quote && <section className="rounded-3xl border border-[#74d5c2] bg-gradient-to-br from-[#ecfbf8] to-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#058574]">Your quotation</p><h3 className="mt-1 text-xl font-extrabold text-[#123c41]">Review quoted subscription</h3></div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#197a70]">Valid until {date(quote.expires_at)}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-[#305c63]">{quote.quote.plan.name} · {quote.quote.plan.billing_period} · {quote.quote.licensed_seats} seats</p>
            <p className="mt-5 text-xs font-semibold uppercase text-slate-500">Quoted amount</p>
            <p className="mt-1 text-4xl font-extrabold tracking-tight text-[#133d45]">Quoted amount: {money(quote.quote.amount_due_minor, quote.quote.currency, quote.quote.plan.currency_exponent)}</p>
            <div className="mt-5 grid gap-3 text-sm text-[#365865] sm:grid-cols-2">
              <p>Certificates: {quote.quote.plan.certificate_limit === null ? "Unlimited" : quote.quote.plan.certificate_limit}</p>
              <p>Included user seats: {quote.quote.plan.included_seats}</p>
              <p>Agreed regular renewal price: {money(quote.quote.regular_renewal_minor, quote.quote.currency, quote.quote.plan.currency_exponent)}</p>
              <p>Extra seat price: {money(quote.quote.plan.extra_seat_price_minor, quote.quote.currency, quote.quote.plan.currency_exponent)}</p>
              {quote.quote.trial_days > 0 && <p>{quote.quote.trial_days}-day trial</p>}
              {quote.quote.discounted_cycles > 0 && <p>Discounted billing cycles: {quote.quote.discounted_cycles}</p>}
            </div>
            {quotePlanId !== planId && <p className="mt-3 text-xs text-amber-800">This quote is for your renewal selection, which can differ from the highlighted new plan.</p>}
            <button disabled={busy} type="button" onClick={() => void act({ action: "accept", quoteId: quote.id, nonce: quoteNonce })}
              className="mt-6 flex items-center gap-2 rounded-xl bg-[#0c7469] px-6 py-3.5 text-sm font-bold text-white hover:bg-[#086357] disabled:opacity-50">
              Confirm quoted subscription <Icon name="arrow" className="h-4 w-4"/>
            </button>
            <p className="mt-3 text-xs text-slate-600">Paid selections activate only after independently verified captured payment.</p>
          </section>}

        </section>

        {s.can_manage && <PaymentSimulation key={s.account_id} />}

        {s.can_cancel && <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div>
            <h3 className="font-bold text-[#1e3749]">Renewal preferences</h3>
            <p className="mt-1 text-sm text-slate-500">Cancellation stops future renewal; existing paid time remains available.</p>
          </div>
          <button disabled={busy || (s.cancel_at_period_end && !s.can_manage)} type="button"
            onClick={() => void act({ action: s.cancel_at_period_end ? "resume_renewal" : "cancel_renewal" })}
            className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-[#27485b] hover:bg-slate-50 disabled:opacity-50">
            {s.cancel_at_period_end ? "Resume renewal preference" : "Cancel renewal"}
          </button>
        </section>}

        {checkoutStatus && <section aria-label="Payment test readiness" className="rounded-2xl border border-[#d7e6eb] bg-white p-5 text-sm text-slate-600">
          <p className="font-bold text-[#244459]">{checkoutStatus.configured ? "Razorpay test checkout is configured" : "Payment gateway setup"}</p>
          <p className="mt-1">{checkoutStatus.message}</p>
          <p className="mt-1 text-xs">Test environment only — no real money is collected.</p>
        </section>}
      </>}
    </div>
  </main>;
}
