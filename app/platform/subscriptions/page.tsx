"use client";
import { useEffect, useState } from "react";
import { PlatformAdminGuide } from "@/components/platform-admin-guide";
import Link from "next/link";
import { PlatformMfa } from "@/components/platform-mfa";
import { platformFetch } from "@/lib/platform/client";
import { formatMoney } from "@/lib/billing/money";
import type { PricingCatalog, PlanTerms } from "@/lib/billing/types";
type Report = {
  total: number;
  page: number;
  accounts: {
    id: string;
    name: string;
    status: string;
    payment_intents: number;
    period: {
      plan_snapshot: PlanTerms;
      ends_at: string;
      licensed_seats: number;
      certificate_limit: number | null;
      certificates_created: number;
      payment_status: string;
    } | null;
    requests: {
      id: string;
      status: string;
      quote: { amount_due_minor: number; currency: string };
    }[];
  }[];
  history: {
    id: string;
    plan_snapshot: PlanTerms;
    starts_at: string;
    ends_at: string;
    payment_status: string;
    list_amount_minor: number;
    amount_due_minor: number;
    currency: string;
  }[];
  audit: {
    id: string;
    action: string;
    actor_id: string;
    occurred_at: string;
    details: Record<string, unknown>;
  }[];
};
function Subscriptions() {
  const [report, setReport] = useState<Report | null>(null);
  const [catalog, setCatalog] = useState<PricingCatalog>({
    plans: [],
    offers: [],
  });
  const [account, setAccount] = useState("");
  const [plan, setPlan] = useState("");
  const [seats, setSeats] = useState(1);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const account =
      new URLSearchParams(window.location.search).get("account") ?? "";
    void Promise.all([
      platformFetch<Report>(
        `/api/platform/subscriptions?${new URLSearchParams(account ? { account } : {})}`,
      ),
      platformFetch<PricingCatalog>("/api/platform/pricing"),
    ])
      .then(([r, c]) => {
        if (active) {
          setReport(r);
          setCatalog(c);
          setAccount(account || r.accounts[0]?.id || "");
          setPlan(c.plans.find((p) => p.status === "active")?.id ?? "");
          setSeats(
            c.plans.find((p) => p.status === "active")?.terms.included_seats ??
              1,
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
  async function load(page = 1) {
    setBusy(true);
    try {
      const filter = new URLSearchParams(window.location.search).get("account");
      setReport(
        await platformFetch<Report>(
          `/api/platform/subscriptions?${new URLSearchParams({ page: String(page), ...(filter ? { account: filter } : {}) })}`,
        ),
      );
    } catch (f) {
      setMessage(f instanceof Error ? f.message : "Report failed.");
    } finally {
      setBusy(false);
    }
  }
  async function grant() {
    setBusy(true);
    setMessage("");
    try {
      const result = await platformFetch<{ status: string }>(
        "/api/platform/subscriptions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: account,
            planId: plan,
            seats,
            reason,
          }),
        },
      );
      await load(report?.page);
      setConfirm(false);
      setReason("");
      setMessage(
        result.status === "scheduled"
          ? "Complimentary change scheduled at the period boundary; current quota is preserved."
          : "Complimentary access granted with waived payment and immutable audit evidence. No charge occurred.",
      );
    } catch (f) {
      setMessage(f instanceof Error ? f.message : "Grant failed.");
    } finally {
      setBusy(false);
    }
  }
  const selectedPlan=catalog.plans.find(p=>p.id===plan);
  const selectedAccount=report?.accounts.find(a=>a.id===account);
  const activeCount=report?.accounts.filter(a=>["active","trial","non_renewing"].includes(a.status)).length??0;
  const pendingCount=report?.accounts.filter(a=>a.requests.some(r=>r.status==="awaiting_payment")).length??0;
  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className="rounded border p-4">
          {message}
        </p>
      )}
      <p className="text-sm leading-6 text-slate-600">Subscription access is based on agreed, versioned plan terms. Paid selections require independent verification of a captured Razorpay payment. Only simulated Razorpay checkout is enabled on staging; automatic recurring charges remain unavailable.</p>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Subscription overview">
        {([["Accounts on this page",report?.accounts.length??0],["Active or trial",activeCount],["Awaiting payment",pendingCount]] as const).map(([label,value])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p></div>)}
      </section>
      <p className="text-xs text-slate-500">Totals here describe the displayed page, not the entire customer base.</p>
      {report && (
        <>
          <p className="font-semibold text-slate-700">{report.total} total matching accounts · Page {report.page}</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Account",
                    "Subscription",
                    "Period end / renewal",
                    "Seats / quota",
                    "Payments",
                  ].map((label) => (
                    <th key={label} className="border-b p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="border-b p-3">
                      <Link
                        className="text-blue-700"
                        href={`/platform/accounts/${a.id}`}
                      >
                        {a.name} →
                      </Link>
                      <p>{a.period?.plan_snapshot.name}</p>
                    </td>
                    <td className="border-b p-3">{a.status}</td>
                    <td className="border-b p-3">
                      {a.period
                        ? new Date(a.period.ends_at).toLocaleString("en-IN")
                        : "No billing period"}
                    </td>
                    <td className="border-b p-3">
                      {a.period
                        ? `${a.period.licensed_seats} seats · ${a.period.certificates_created} / ${a.period.certificate_limit ?? "Unlimited"} certificates`
                        : "Not activated"}
                    </td>
                    <td className="border-b p-3">
                      {a.period?.payment_status ?? "No payment"}
                      <p>{a.payment_intents} payment intents</p>
                      {a.requests.map((r) => (
                        <p key={r.id}>{r.status.replaceAll("_", " ")}</p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.accounts.length && <p className="p-6 text-sm text-slate-600">No matching customer subscriptions.</p>}
          </div>
          <div className="flex gap-4">
            <button
              disabled={busy || report.page === 1}
              onClick={() => {
                void load(report.page - 1);
              }}
            >
              Previous subscriptions
            </button>
            <button
              disabled={busy || report.page * 25 >= report.total}
              onClick={() => {
                void load(report.page + 1);
              }}
            >
              Next subscriptions
            </button>
          </div>
        </>
      )}
      <form
        className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) {
            setMessage("A complimentary grant reason is required.");
            return;
          }
          setConfirm(true);
        }}
      >
        <h2 className="text-xl font-bold">Complimentary access · Administrator override</h2>
        <p className="text-sm text-slate-600">Use only for authorized trials, pilots or support adjustments; do not use it as a substitute for testing Razorpay checkout. Each waiver requires a recorded reason and never marks an unverified payment as paid. An active paid period remains intact until its boundary.</p>
        <label className="block">
          Customer account
          <select
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setConfirm(false);
            }}
            disabled={busy || confirm}
            className="ml-3 border p-2"
          >
            {report?.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Complimentary plan
          <select
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setSeats(
                catalog.plans.find((p) => p.id === e.target.value)?.terms
                  .included_seats ?? 1,
              );
              setConfirm(false);
            }}
            disabled={busy || confirm}
            className="ml-3 border p-2"
          >
            <option value="">Select active plan</option>
            {catalog.plans
              .filter((p) => p.status === "active")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.terms.name}
                </option>
              ))}
          </select>
        </label>
        {selectedPlan && <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700"><p className="font-semibold">{selectedPlan.terms.name}</p><p>{formatMoney(selectedPlan.terms.price_minor,selectedPlan.terms.currency,selectedPlan.terms.currency_exponent)} / {selectedPlan.terms.billing_period} · {selectedPlan.terms.certificate_limit===null?"Unlimited certificates":`${selectedPlan.terms.certificate_limit} certificates per period`} · {selectedPlan.terms.included_seats} included users</p><p className="mt-1 text-xs text-slate-500">Complimentary grants waive the charge; they do not process a payment.</p></div>}
        <label className="block">
          Granted licensed seats
          <input
            type="number"
            min={1}
            max={10000}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
            disabled={busy || confirm}
            className="ml-3 border p-2"
          />
        </label>
        <label className="block">
          Complimentary grant reason
          <textarea
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy || confirm}
            className="mt-2 block w-full border p-2"
          />
        </label>
        {!confirm ? (
          <button
            disabled={busy || !plan || !account}
            className="rounded bg-blue-700 px-4 py-2 text-white"
          >
            Review complimentary grant
          </button>
        ) : (
          <div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-bold text-amber-950">Review before granting access</p><p>Customer: {selectedAccount?.name ?? account}</p><p>Plan: {selectedPlan?.terms.name ?? plan}</p><p>Licensed users: {seats} · Fee waived · Reason: {reason}</p><p className="mt-2 text-amber-900">This is an audited administrative grant, not a Razorpay payment.</p></div>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void grant();
              }}
              className="mt-3 rounded bg-teal-700 px-4 py-2 font-bold text-white"
            >
              Confirm complimentary grant
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm(false)}
              className="ml-4"
            >
              Cancel
            </button>
          </div>
        )}
      </form>
      {!!report?.history.length && (
        <section className="rounded border p-6">
          <h2 className="text-xl font-semibold">
            Financial and subscription history
          </h2>
          {report.history.map((p) => (
            <p key={p.id} className="mt-3">
              {p.plan_snapshot.name} ·{" "}
              {new Date(p.starts_at).toLocaleDateString("en-IN")} –{" "}
              {new Date(p.ends_at).toLocaleDateString("en-IN")} · listed{" "}
              {formatMoney(
                p.list_amount_minor,
                p.currency,
                p.plan_snapshot.currency_exponent,
              )}{" "}
              · due{" "}
              {formatMoney(
                p.amount_due_minor,
                p.currency,
                p.plan_snapshot.currency_exponent,
              )}{" "}
              · {p.payment_status}
            </p>
          ))}
        </section>
      )}
      {!!report?.audit.length && (
        <section className="rounded border p-6">
          <h2 className="text-xl font-semibold">Immutable financial audit</h2>
          {report.audit.map((e) => (
            <p key={e.id} className="mt-3">
              {e.action} · {new Date(e.occurred_at).toLocaleString("en-IN")} ·
              actor {e.actor_id}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
export default function SubscriptionAdminPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <h1 className="text-3xl font-bold">Subscription administration</h1>
      <PlatformAdminGuide section="subscriptions" />
      <PlatformMfa>
        <Subscriptions />
      </PlatformMfa>
    </main>
  );
}
