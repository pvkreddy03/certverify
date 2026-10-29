"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { brandingFetch } from "@/lib/branding/client";
import { formatMoney } from "@/lib/billing/money";
import type { SubscriptionStatus } from "@/lib/billing/types";

type BillingReport = { subscription: SubscriptionStatus };
const friendly = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, s => s.toUpperCase());
function when(value: string) { return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

function InvoiceMark() {
  return <svg aria-hidden="true" className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3h14v18l-3-2-4 2-4-2-3 2z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
}

export default function SubscriptionOrdersPage() {
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void brandingFetch("/api/billing").then((data: BillingReport) => {
      if (active) setSubscription(data.subscription);
    }).catch(error => {
      if (active) setMessage(error instanceof Error ? error.message : "Orders could not be loaded.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function cancelRequest(id: string) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      await brandingFetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel_request", requestId: id }),
      });
      const data = await brandingFetch("/api/billing") as BillingReport;
      setSubscription(data.subscription);
      setMessage("Subscription request cancelled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request could not be cancelled.");
    } finally { setBusy(false); }
  }

  return <main className="cv-page min-h-screen"><div className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-6 sm:py-10">
    <header className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#11213b] to-[#116c68] p-6 text-white sm:p-9">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15"><InvoiceMark /></div>
          <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#83e8da]">Account billing</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">My Orders</h1>
            <p className="mt-1 text-sm text-[#d6eeec]">Find your subscription periods, payments and requests here.</p>
          </div>
        </div>
        <Link href="/dashboard/subscription" className="rounded-xl border border-white/30 bg-white/15 px-5 py-3 text-sm font-bold text-white hover:bg-white/25">← Back to plans</Link>
      </div>
    </header>
    <nav aria-label="Subscription sections" className="flex gap-2 border-b border-slate-200 pb-2 text-sm font-semibold">
      <Link href="/dashboard/subscription" className="rounded-xl px-5 py-3 text-slate-600 hover:bg-slate-100">Plans &amp; subscription</Link>
      <span aria-current="page" className="rounded-xl bg-[#113c4f] px-5 py-3 text-white">My Orders</span>
    </nav>
    {message && <p role="status" className="rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 text-sm font-medium text-teal-950">{message}</p>}
    {loading && <p role="status" className="cv-panel p-7 text-slate-600">Loading your orders…</p>}
    {subscription && <>
      <section className="cv-panel rounded-3xl p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#068d81]">Payment history</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#1a354a]">Your payments</h2>
          </div>
          <span className="rounded-xl bg-[#edf7f8] px-3 py-1.5 text-xs font-semibold text-[#275d66]">{subscription.payments.length} payment records</span>
        </div>
        {subscription.payments.length === 0 ? <div className="mt-5 rounded-2xl bg-[#f4f8fa] p-7 text-center text-sm text-slate-600">No payment attempts recorded yet. Once you make a subscription payment, its status will appear here.</div> :
        <div className="mt-5 space-y-3">
          {subscription.payments.map(payment => <article key={payment.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e2ebef] p-4 sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f6f5] text-[#0c8276]">
              <InvoiceMark />
            </div>
            <div className="min-w-40 flex-1">
              <h3 className="font-bold text-[#214158]">{formatMoney(payment.amount_minor, payment.currency, 2)}</h3>
              <p className="mt-0.5 text-xs text-slate-500">{when(payment.created_at)} · {payment.provider}</p>
              {typeof payment.refunded_minor === "number" && payment.refunded_minor > 0 &&
                <p className="mt-1 text-xs font-medium text-amber-800">Refund recorded: {formatMoney(payment.refunded_minor, payment.currency, 2)}</p>}
            </div>
            <span className="rounded-full bg-[#edf3f7] px-3 py-1.5 text-xs font-bold text-[#456073]">{friendly(payment.status)}</span>
            {subscription.can_manage && ["pending", "ready", "preparing", "authorized", "failed"].includes(payment.status) &&
              <Link href={"/dashboard/payment?intent=" + encodeURIComponent(payment.id)}
                className="rounded-xl bg-[#0c746a] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#085b53]">Open payment checkout</Link>}
          </article>)}
        </div>}
      </section>

      <section className="cv-panel rounded-3xl p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.15em] text-[#068d81]">Subscriptions</p>
            <h2 className="mt-1 text-xl font-extrabold text-[#1a354a]">Previous subscription periods</h2>
          </div>
          <span className="rounded-xl bg-[#edf7f8] px-3 py-1.5 text-xs font-semibold text-[#275d66]">{subscription.history.length} periods</span>
        </div>
        {subscription.history.length === 0 ? <p className="mt-5 rounded-2xl bg-[#f4f8fa] p-6 text-sm text-slate-600">No completed or scheduled subscription periods recorded yet.</p> :
        <div className="mt-5 space-y-3">{subscription.history.map(period => <article key={period.id}
          className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e2ebef] p-4 sm:p-5">
          <div className="flex-1">
            <h3 className="font-bold text-[#214158]">{period.plan_snapshot.name}</h3>
            <p className="mt-1 text-xs text-slate-500">{when(period.starts_at)} – {when(period.ends_at)} · {period.licensed_seats} seats</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-[#214158]">{formatMoney(period.amount_due_minor, period.currency, period.plan_snapshot.currency_exponent)} due</p>
            <p className="mt-1 text-xs text-slate-600">{friendly(period.payment_status)}</p>
          </div>
        </article>)}</div>}
      </section>

      <section className="cv-panel rounded-3xl p-6 sm:p-7">
        <h2 className="text-xl font-extrabold text-[#1a354a]">Subscription requests</h2>
        <p className="mt-1 text-sm text-slate-500">Pending changes, renewals and requests are listed separately from completed payments.</p>
        {subscription.requests.length === 0 ? <p className="mt-5 rounded-2xl bg-[#f4f8fa] p-6 text-sm text-slate-600">No subscription requests recorded.</p> :
          <div className="mt-5 space-y-3">{subscription.requests.map(request => <article key={request.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e2ebef] p-4">
            <div className="flex-1">
              <p className="font-bold text-[#214158]">{request.quote.plan.name}</p>
              <p className="mt-1 text-xs text-slate-600">{friendly(request.intent)} · {friendly(request.status)}</p>
              {request.scheduled_for && <p className="mt-1 text-xs text-slate-600">Scheduled for {when(request.scheduled_for)}</p>}
            </div>
            {subscription.can_manage && ["quoted", "awaiting_payment", "scheduled", "needs_review"].includes(request.status) &&
              <button disabled={busy} type="button" className="rounded-xl border border-red-200 px-4 py-2.5 text-xs font-bold text-red-700 disabled:opacity-50"
                onClick={() => void cancelRequest(request.id)}>Cancel request</button>}
          </article>)}</div>}
      </section>
      <p className="text-center text-xs text-slate-500">Your order history is a record of payment and subscription status, not a tax invoice. If you need a tax invoice, contact CertVerify support.</p>
    </>}
  </div></main>;
}
