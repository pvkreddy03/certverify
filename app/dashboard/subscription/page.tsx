"use client";
import { useEffect, useState } from "react";
import { brandingFetch } from "@/lib/branding/client";
import { formatMoney } from "@/lib/billing/money";
import type {
  CatalogPlan,
  Quote,
  SubscriptionStatus,
} from "@/lib/billing/types";
type Report = { subscription: SubscriptionStatus; plans: CatalogPlan[] };
export default function SubscriptionPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [planId, setPlanId] = useState("");
  const [seats, setSeats] = useState(1);
  const [coupon, setCoupon] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteNonce, setQuoteNonce] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void brandingFetch("/api/billing")
      .then((data: Report) => {
        if (active) {
          setReport(data);
          const first = data.plans.find((p) =>
            p.terms.eligibility.includes(data.subscription.account_type),
          );
          setPlanId(first?.id ?? "");
          setSeats(
            Math.max(
              first?.terms.included_seats ?? 1,
              data.subscription.allocated_seats,
            ),
          );
        }
      })
      .catch((f) => {
        if (active) setMessage(f.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const data = await brandingFetch("/api/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (body.action === "quote") {
        setQuote(data);
        setQuoteNonce(crypto.randomUUID());
        setMessage("Review the server-calculated terms before confirming.");
      } else {
        setQuote(null);
        setReport(await brandingFetch("/api/billing"));
        setMessage(
          data.status === "awaiting_payment"
            ? "Selection saved awaiting verified payment. Payment collection is not enabled; no charge or paid access activation occurred."
            : data.status === "scheduled"
              ? "Change scheduled for the next billing period. Current quota is preserved."
              : "Subscription action completed and audited.",
        );
      }
    } catch (f) {
      setMessage(
        f instanceof Error ? f.message : "Subscription action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const s = report?.subscription;
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <h1 className="text-3xl font-bold">Subscription and renewal</h1>
      {message && (
        <p role="status" className="rounded border p-4">
          {message}
        </p>
      )}
      {!report && !message && <p>Loading subscription…</p>}
      {s && (
        <>
          <section className="space-y-2 rounded border bg-white p-6">
            <h2 className="text-xl font-semibold">
              Current subscription — {s.status}
            </h2>
            <p>{s.period?.name ?? "No activated subscription"}</p>
            <p>
              New certificate issuance:{" "}
              {s.entitled
                ? "Eligible subject to quota"
                : "Unavailable until subscription activation or renewal"}
            </p>
            {s.period && (
              <>
                <p>
                  Certificates this period: {s.period.certificates_created} /{" "}
                  {s.period.certificate_limit ?? "Unlimited"}
                </p>
                <p>
                  Remaining certificates:{" "}
                  {s.period.remaining_certificates ?? "Unlimited"}
                </p>
                <p>
                  Licensed seats: {s.period.licensed_seats}. Active users and
                  reserved invitations: {s.allocated_seats}.
                </p>
                <p>
                  Period ends / renewal due:{" "}
                  {new Date(s.period.ends_at).toLocaleString("en-IN")}
                </p>
                <p>
                  Payment status: {s.period.payment_status.replaceAll("_", " ")}
                </p>
              </>
            )}
            <p className="text-sm">
              Verification scans never consume generation quota. Revocation does
              not restore consumed quota. Previously issued certificates stay
              verifiable.
            </p>
          </section>
          {s.can_manage && (
            <section className="space-y-4 rounded border bg-white p-6">
              <h2 className="text-xl font-semibold">
                Choose or change a subscription
              </h2>
              <label>
                Subscription plan
                <select
                  value={planId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setPlanId(id);
                    setQuote(null);
                    const p = report?.plans.find((p) => p.id === id);
                    setSeats(
                      Math.max(p?.terms.included_seats ?? 1, s.allocated_seats),
                    );
                  }}
                  className="ml-3 rounded border p-2"
                >
                  <option value="">Select a plan</option>
                  {report?.plans
                    .filter((p) => p.terms.eligibility.includes(s.account_type))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.terms.name} —{" "}
                        {formatMoney(
                          p.terms.price_minor,
                          p.terms.currency,
                          p.terms.currency_exponent,
                        )}{" "}
                        / {p.terms.billing_period}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                Licensed user seats
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={seats}
                  onChange={(e) => {
                    setSeats(Number(e.target.value));
                    setQuote(null);
                  }}
                  className="ml-3 border p-2"
                />
              </label>
              <label className="block">
                Coupon code (optional)
                <input
                  value={coupon}
                  onChange={(e) => {
                    setCoupon(e.target.value);
                    setQuote(null);
                  }}
                  maxLength={40}
                  className="ml-3 border p-2"
                />
              </label>
              <div className="flex flex-wrap gap-4">
                <button
                  disabled={busy || !planId}
                  onClick={() => {
                    void act({
                      action: "quote",
                      planId,
                      seats,
                      coupon,
                      intent: s.period ? "change" : "start",
                    });
                  }}
                  className="rounded bg-blue-700 px-4 py-2 text-white"
                >
                  Get subscription quote
                </button>
                <button
                  disabled={busy || !planId || s.trial_used || s.entitled}
                  onClick={() => {
                    void act({
                      action: "quote",
                      planId,
                      seats,
                      coupon,
                      intent: "trial",
                    });
                  }}
                  className="rounded border px-4 py-2"
                >
                  Request free trial quote
                </button>
                {s.period && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      void act({
                        action: "quote",
                        planId: s.period!.plan_id,
                        seats: s.period!.licensed_seats,
                        coupon,
                        intent: "renewal",
                      });
                    }}
                    className="rounded border px-4 py-2"
                  >
                    Quote renewal at agreed price
                  </button>
                )}
              </div>
              <p className="text-sm">
                Upgrades, downgrades and seat changes preserve the current
                period and take effect at its boundary after authorization.
                Enterprise selections require platform assistance. No live
                checkout or automatic charges are enabled.
              </p>
              {quote && (
                <section className="space-y-2 rounded border bg-blue-50 p-4">
                  <h3 className="font-semibold">Review quoted subscription</h3>
                  <p>
                    {quote.quote.plan.name} · {quote.quote.plan.billing_period}{" "}
                    · {quote.quote.licensed_seats} seats
                  </p>
                  <p>
                    Quoted amount:{" "}
                    {formatMoney(
                      quote.quote.amount_due_minor,
                      quote.quote.currency,
                      quote.quote.plan.currency_exponent,
                    )}
                  </p>
                  <p>
                    {quote.quote.trial_days
                      ? `${quote.quote.trial_days}-day trial`
                      : quote.quote.plan.certificate_limit === null
                        ? "Unlimited certificates"
                        : `${quote.quote.plan.certificate_limit} certificates per period`}
                  </p>
                  <p>
                    Agreed regular renewal price:{" "}
                    {formatMoney(
                      quote.quote.regular_renewal_minor,
                      quote.quote.currency,
                      quote.quote.plan.currency_exponent,
                    )}{" "}
                    for the quoted licensed seats.
                  </p>
                  <p>
                    Included seats: {quote.quote.plan.included_seats}; each
                    additional seat:{" "}
                    {formatMoney(
                      quote.quote.plan.extra_seat_price_minor,
                      quote.quote.currency,
                      quote.quote.plan.currency_exponent,
                    )}{" "}
                    per billing period.
                  </p>
                  {quote.quote.discounted_cycles > 0 && (
                    <p>
                      Discounted billing cycles remaining, including this
                      selection: {quote.quote.discounted_cycles}
                    </p>
                  )}
                  <p>
                    Quote expires{" "}
                    {new Date(quote.expires_at).toLocaleString("en-IN")}. Paid
                    quotes remain pending until verified payment; free
                    selections may activate or schedule access.
                  </p>
                  <button
                    disabled={busy}
                    onClick={() => {
                      void act({
                        action: "accept",
                        quoteId: quote.id,
                        nonce: quoteNonce,
                      });
                    }}
                    className="rounded bg-blue-700 px-4 py-2 text-white"
                  >
                    Confirm quoted subscription
                  </button>
                </section>
              )}
            </section>
          )}
          {s.can_cancel && (
            <button
              disabled={busy || (s.cancel_at_period_end && !s.can_manage)}
              onClick={() => {
                void act({
                  action: s.cancel_at_period_end
                    ? "resume_renewal"
                    : "cancel_renewal",
                });
              }}
              className="rounded border px-4 py-2"
            >
              {s.cancel_at_period_end
                ? "Resume renewal preference"
                : "Cancel renewal"}
            </button>
          )}
          {!s.can_manage && (
            <p>
              Verify your email or ask your account owner to manage subscription
              choices. Account suspension must be resolved through platform
              support.
            </p>
          )}
          {!!s.requests.length && (
            <section className="rounded border p-6">
              <h2 className="text-xl font-semibold">Subscription requests</h2>
              {s.requests.map((r) => (
                <article key={r.id} className="mt-3 border-b pb-3">
                  <p>
                    {r.quote.plan.name} — {r.intent} —{" "}
                    {r.status.replaceAll("_", " ")}
                  </p>
                  {r.scheduled_for && (
                    <p>
                      Scheduled{" "}
                      {new Date(r.scheduled_for).toLocaleString("en-IN")}
                    </p>
                  )}
                  {s.can_manage &&
                    [
                      "quoted",
                      "awaiting_payment",
                      "scheduled",
                      "needs_review",
                    ].includes(r.status) && (
                      <button
                        disabled={busy}
                        onClick={() => {
                          void act({
                            action: "cancel_request",
                            requestId: r.id,
                          });
                        }}
                        className="text-red-700"
                      >
                        Cancel this request
                      </button>
                    )}
                </article>
              ))}
            </section>
          )}
          {!!s.history.length && (
            <section className="rounded border p-6">
              <h2 className="text-xl font-semibold">
                Immutable billing-period history
              </h2>
              {s.history.map((h) => (
                <p key={h.id} className="mt-3">
                  {h.plan_snapshot.name} ·{" "}
                  {new Date(h.starts_at).toLocaleDateString("en-IN")} –{" "}
                  {new Date(h.ends_at).toLocaleDateString("en-IN")} ·{" "}
                  {formatMoney(
                    h.amount_due_minor,
                    h.currency,
                    h.plan_snapshot.currency_exponent,
                  )}{" "}
                  due · {h.payment_status.replaceAll("_", " ")} ·{" "}
                  {h.licensed_seats} seats
                </p>
              ))}
            </section>
          )}
          {!!s.payments.length && (
            <section className="rounded border p-6">
              <h2 className="text-xl font-semibold">Payment intent history</h2>
              {s.payments.map((p) => (
                <p key={p.id} className="mt-3">
                  {p.status} · {p.currency} {p.amount_minor} minor units ·
                  provider {p.provider}
                </p>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
