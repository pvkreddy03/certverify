"use client";
import { useEffect, useState } from "react";
import { PlatformAdminGuide } from "@/components/platform-admin-guide";
import { platformFetch } from "@/lib/platform/client";
import Link from "next/link";
import { formatMoney, parseMoney } from "@/lib/billing/money";
function money(amount:number,currency:string) {
  const digits=new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits;
  return formatMoney(amount,currency,digits);
}
type Readiness = { mode:string;configured:boolean;testOnly:true;livePaymentsEnabled:false;message:string };
type Attempt = {
  id: string;
  account_id: string;
  order_id: string | null;
  state: string;
  amount_minor: number;
  currency: string;
  refunded_minor: number;
  captured_payment_id: string | null;
  settlement: string | null;
};
export default function Payments() {
  const [readiness,setReadiness] = useState<Readiness|null>(null);
  const [rows, setRows] = useState<Attempt[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [attemptId, setAttemptId] = useState(""),
    [orderId, setOrderId] = useState(""),
    [paymentId, setPaymentId] = useState(""),
    [refundAmount, setRefundAmount] = useState(""),
    [reason, setReason] = useState("");
  useEffect(() => {
    let alive = true;
    void platformFetch<Readiness>("/api/platform/payments/readiness")
      .then(status=>{if(alive)setReadiness(status);})
      .catch(()=>{ /* A failed health report must not imply checkout readiness. */ });
    void platformFetch<{ attempts: Attempt[]; total: number }>(
      `/api/platform/payments?page=${page}`,
    )
      .then((data) => {
        if (alive) {
          setRows(data.attempts);
          setTotal(data.total);
        }
      })
      .catch((error) => {
        if (alive) setMessage(error.message);
      });
    return () => {
      alive = false;
    };
  }, [page]);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await platformFetch("/api/platform/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const report = await platformFetch<{
        attempts: Attempt[];
        total: number;
      }>(`/api/platform/payments?page=${page}`);
      setRows(report.attempts);
      setMessage(
        "Operation recorded. Reconcile authoritative payment state before assuming a refund has completed.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operation unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  const selected=rows.find(row=>row.id===attemptId);
  const settled=rows.filter(row=>row.state==="captured"||row.settlement==="active").length;
  const attention=rows.filter(row=>["review","preparing","authorized"].includes(row.state)).length;
  function requestRefund() {
    if (!selected) {setMessage("Select a payment attempt from the table before requesting a refund.");return;}
    if (!reason.trim()) {setMessage("A refund reason is mandatory.");return;}
    try {
      const exponent=new Intl.NumberFormat("en",{style:"currency",currency:selected.currency}).resolvedOptions().maximumFractionDigits;
      const minor=parseMoney(refundAmount,exponent);
      if(minor<=0 || minor>selected.amount_minor-selected.refunded_minor) throw new Error("Enter a positive refund amount within the remaining captured amount.");
      if(!window.confirm(`Request a test refund of ${money(minor,selected.currency)} for payment attempt ${selected.id}? This operation contacts Razorpay; verify the selection first.`))return;
      void act({action:"refund",attemptId:selected.id,amountMinor:minor,reason:reason.trim()});
    }catch(error){setMessage(error instanceof Error?error.message:"Invalid refund amount.");}
  }
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PlatformAdminGuide section="payments" />
      <h1 className="text-3xl font-bold">
        Payment monitoring and reconciliation
      </h1>
      {readiness && <div role="note" className={`rounded-xl border p-4 text-sm ${readiness.configured?"border-teal-200 bg-teal-50 text-teal-950":"border-amber-200 bg-amber-50 text-amber-950"}`}><p className="font-bold">{readiness.configured?"Razorpay Test Mode configured":"Razorpay Test Mode not ready"}</p><p className="mt-1">{readiness.message}</p><p className="mt-2 text-xs">Configuration is not a successful payment test. Only verified captured transactions can activate paid subscriptions.</p></div>}
      <p className="text-sm leading-6 text-slate-600">Test transactions only. Captured payments awaiting review do not grant access. Partial refunds preserve quotas; full refunds and disputes block the related paid period. Recurring mandates are not available yet.</p>
      <section aria-label="Payment overview" className="grid gap-3 sm:grid-cols-3">
        {([["Attempts on this page",rows.length],["Captured / active",settled],["Needs verification",attention]] as const).map(([label,count])=><div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{count}</p></div>)}
      </section>
      <p className="text-xs text-slate-500">Summary counts are for the current page only. Financial status comes from verified server records, not these counters.</p>
      {message && (
        <p role="status" className="rounded border p-3">
          {message}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Account / attempt</th>
              <th>Payment state</th>
              <th>Amount / refund</th>
              <th>Gateway reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-3">
                  <Link href={`/platform/accounts/${row.account_id}`} className="font-semibold text-teal-700 hover:underline">View account</Link>
                  <span className="block break-all text-xs text-slate-500">{row.account_id}</span>
                  <span className="block break-all text-xs text-slate-500">Attempt {row.id}</span>
                </td>
                <td>
                  {row.state} / {row.settlement ?? "none"}
                </td>
                <td>
                  <span className="block font-semibold">{money(row.amount_minor,row.currency)}</span>
                  <span className="text-xs text-slate-500">Refunded: {money(row.refunded_minor,row.currency)}</span>
                </td>
                <td>
                  {row.order_id ?? "Uncertain order creation"}
                  <br />
                  {row.captured_payment_id ?? "No verified capture"}
                  <button type="button" onClick={()=>{setAttemptId(row.id);setOrderId(row.order_id??"");setPaymentId(row.captured_payment_id??"");setRefundAmount("");setReason("");}} className="mt-2 block rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100">Select for review</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-sm text-slate-600">No payment attempts recorded. Create a paid quote in a staging customer account to begin testing.</p>}
      </div>
      <button disabled={page === 1} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <span className="px-4">Page {page}</span>
      <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>
        Next
      </button>
      <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xl font-bold">1. Verify payment status</h2>
        <p className="text-sm text-slate-600">Use a Razorpay payment reference (starts with pay_) to fetch authoritative status. Selecting a row above fills it automatically.</p>
        <input
          aria-label="Gateway payment ID"
          className="rounded border p-2"
          value={paymentId}
          onChange={(e) => setPaymentId(e.target.value)}
        />
        <button
          disabled={busy || !/^pay_[A-Za-z0-9]+$/.test(paymentId.trim())}
          onClick={() => void act({ action: "reconcile", paymentId:paymentId.trim() })}
        >
          Fetch authoritative status
        </button>
        <div className="border-t border-slate-100 pt-4"><h2 className="text-xl font-bold">2. Recover an uncertain order</h2><p className="mt-1 text-sm text-slate-600">Only use this when Razorpay already created an order but the application did not save its reference. Do not create another charge.</p></div>
        <input
          aria-label="Attempt ID"
          className="rounded border p-2"
          value={attemptId}
          onChange={(e) => setAttemptId(e.target.value)}
        />
        <input
          aria-label="Gateway order ID"
          className="rounded border p-2"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
        />
        <button
          disabled={busy || !attemptId.trim() || !/^order_[A-Za-z0-9]+$/.test(orderId.trim())}
          onClick={() => {if(window.confirm("Verify and associate this existing Razorpay order with the selected attempt?"))void act({action:"bind_order",attemptId,orderId:orderId.trim()});}}
        >
          Verify and bind existing order
        </button>
        <div className="border-t border-slate-100 pt-4"><h2 className="text-xl font-bold">3. Request a test refund</h2><p className="mt-1 text-sm text-slate-600">Select a captured attempt from the table. Refunds are real gateway actions within Razorpay Test Mode and may need reconciliation after a timeout.</p>{selected && <p className="mt-2 text-sm font-semibold">Selected attempt: {selected.id} · {money(selected.amount_minor,selected.currency)} ({selected.state})</p>}</div>
        <input
          type="number"
          min="0.01"
          step="0.01"
          aria-label="Refund amount"
          value={refundAmount}
          onChange={(e) => setRefundAmount(e.target.value)}
          className="rounded border p-2"
        />
        <textarea
          aria-label="Refund reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="block w-full rounded border p-2"
        />
        <button
          disabled={busy || !selected || !selected.captured_payment_id || !reason.trim() || !refundAmount}
          onClick={requestRefund}
        >
          Submit single refund request
        </button>
        <p>
          One external request per recorded command. If a request times out, reconcile status rather than retrying. No live gateway credentials are accepted.
        </p>
      </section>
    </main>
  );
}
