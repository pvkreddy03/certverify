"use client";
import { useEffect, useState } from "react";
import { PlatformAdminGuide } from "@/components/platform-admin-guide";
import { platformFetch } from "@/lib/platform/client";
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
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <PlatformAdminGuide section="payments" />
      <h1 className="text-3xl font-bold">
        Payment monitoring and reconciliation
      </h1>
      <p>
        Test gateway only. Captured payments awaiting review do not grant
        access. Partial refunds preserve quotas; full refunds and disputes block
        the related paid period.
      </p>
      {message && (
        <p role="status" className="rounded border p-3">
          {message}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
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
                  {row.account_id}
                  <br />
                  {row.id}
                </td>
                <td>
                  {row.state} / {row.settlement ?? "none"}
                </td>
                <td>
                  {row.currency} {row.amount_minor} / {row.refunded_minor} minor
                  units
                </td>
                <td>
                  {row.order_id ?? "Uncertain order creation"}
                  <br />
                  {row.captured_payment_id ?? "No verified capture"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button disabled={page === 1} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <span className="px-4">Page {page}</span>
      <button disabled={page * 25 >= total} onClick={() => setPage(page + 1)}>
        Next
      </button>
      <section className="space-y-3 rounded border p-4">
        <h2 className="text-xl font-semibold">Reconcile a payment</h2>
        <input
          aria-label="Gateway payment ID"
          className="rounded border p-2"
          value={paymentId}
          onChange={(e) => setPaymentId(e.target.value)}
        />
        <button
          disabled={busy}
          onClick={() => void act({ action: "reconcile", paymentId })}
        >
          Fetch authoritative status
        </button>
        <h2 className="text-xl font-semibold">Recover an uncertain order</h2>
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
          disabled={busy}
          onClick={() => void act({ action: "bind_order", attemptId, orderId })}
        >
          Verify and bind existing order
        </button>
        <h2 className="text-xl font-semibold">Request test refund</h2>
        <input
          type="number"
          min="1"
          aria-label="Refund amount in minor units"
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
          disabled={busy || !reason}
          onClick={() =>
            void act({
              action: "refund",
              attemptId,
              amountMinor: Number(refundAmount),
              reason,
            })
          }
        >
          Submit single refund request
        </button>
        <p>
          One external request per recorded command. A timeout requires
          reconciliation, not retrying the charge or refund. No live gateway
          credentials are accepted.
        </p>
      </section>
    </main>
  );
}
