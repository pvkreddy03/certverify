"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { brandingFetch } from "@/lib/branding/client";
type Attempt = {
  attemptId: string;
  orderId: string | null;
  amount: number;
  currency: string;
  keyId: string;
  expiresAt: string;
  state: string;
  testMode: boolean;
};
type Confirmation = { razorpay_payment_id: string; razorpay_signature: string };
type RazorpayConstructor = new (options: Record<string, unknown>) => {
  open(): void;
};
async function checkoutScript(): Promise<RazorpayConstructor> {
  const current = window as Window & { Razorpay?: RazorpayConstructor };
  if (current.Razorpay) return current.Razorpay;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(
        new Error("Checkout could not load. No payment success is assumed."),
      );
    document.head.appendChild(script);
  });
  if (!current.Razorpay) throw new Error("Checkout is unavailable.");
  return current.Razorpay;
}
function Payment() {
  const query = useSearchParams();
  const intentId = query.get("intent");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [message, setMessage] = useState(
    "Checkout is disabled unless Razorpay test mode is explicitly configured. No live charges are supported.",
  );
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    try {
      const data: Attempt = await brandingFetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId }),
      });
      setAttempt(data);
      if (!data.orderId) {
        setMessage(
          "Order creation has an uncertain outcome. Contact support for reconciliation; no duplicate order will be created.",
        );
        return;
      }
      if (
        Date.parse(data.expiresAt) <= Date.now() ||
        !["preparing", "ready", "authorized", "failed"].includes(data.state)
      ) {
        setMessage(
          "This checkout cannot be reopened. Refresh its verified status or request a new quote.",
        );
        return;
      }
      const Razorpay = await checkoutScript();
      new Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: "CertVerify test checkout",
        handler: async (confirmation: Confirmation) => {
          setMessage(
            "Checking payment with the server. Access is not granted by the browser callback.",
          );
          try {
            const verified = await brandingFetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                attemptId: data.attemptId,
                paymentId: confirmation.razorpay_payment_id,
                signature: confirmation.razorpay_signature,
              }),
            });
            setMessage(
              verified.settlement === "active"
                ? "Captured payment verified. Subscription access is active."
                : verified.settlement === "scheduled"
                  ? "Captured payment verified. Subscription change is scheduled for the next period."
                  : `Payment status: ${verified.state}. Access is granted only after verified settlement; contact support if review is required.`,
            );
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : "Verification failed. Refresh status before retrying.",
            );
          }
        },
        modal: {
          ondismiss: () =>
            setMessage(
              "Checkout closed. Closing the window does not cancel an order or prove payment failure. Refresh verified status.",
            ),
        },
      }).open();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    if (!attempt) return;
    setBusy(true);
    try {
      const state = await brandingFetch(
        `/api/payments/verify?attempt=${attempt.attemptId}`,
      );
      setMessage(
        `Verified database status: ${state.state}; settlement: ${state.settlement ?? "none"}. ${state.state === "review" ? "Contact support for reconciliation." : ""}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Status unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-8">
      <h1 className="text-3xl font-bold">Payment and verification</h1>
      <p role="status" className="rounded border p-4">
        {message}
      </p>
      <p>
        Renewals are explicit payments. Automatic recurring charges are not
        enabled. Existing certificate verification is preserved.
      </p>
      {attempt && (
        <p>
          Reference {attempt.attemptId} · {attempt.currency} {attempt.amount}{" "}
          minor units
        </p>
      )}
      <button
        className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        disabled={busy || !intentId}
        onClick={() => void start()}
      >
        Open test checkout
      </button>
      {attempt && (
        <button
          className="ml-3 rounded border px-4 py-2"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Refresh verified status
        </button>
      )}
      <Link className="block text-blue-700" href="/dashboard/subscription">
        Back to subscription and payment history
      </Link>
    </main>
  );
}
export default function PaymentPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading payment details…</p>}>
      <Payment />
    </Suspense>
  );
}
