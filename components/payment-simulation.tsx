"use client";

import { useEffect, useState } from "react";
import { brandingFetch } from "@/lib/branding/client";

export function PaymentSimulation() {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void brandingFetch("/api/payments/simulate")
      .then((result) => {
        if (active) setEnabled(result.enabled === true);
      })
      .catch(() => {
        // The demonstration is optional. Fail closed without blocking billing.
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!enabled) return null;
  async function demonstrate(outcome: "approved" | "declined" | "cancelled") {
    setBusy(true);
    try {
      const result = await brandingFetch("/api/payments/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      if (
        result.demoOnly !== true ||
        result.paymentRecorded !== false ||
        result.subscriptionActivated !== false ||
        result.settlement !== null
      )
        throw new Error("The demonstration result could not be confirmed.");
      setMessage(`Demonstration outcome: ${outcome}. ${result.message}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Demonstration unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded border border-amber-300 bg-amber-50 p-6">
      <h2 className="text-xl font-semibold">Checkout demonstration</h2>
      <p>Demo only — no payment recorded or subscription activated.</p>
      <p>
        Explore checkout outcomes without entering payment details. To issue
        certificates, confirm an available free trial above or use separately
        approved complimentary access. Genuine Razorpay test checkout requires
        gateway configuration.
      </p>
      <div className="flex flex-wrap gap-3">
        {(["approved", "declined", "cancelled"] as const).map((outcome) => (
          <button
            key={outcome}
            disabled={busy}
            onClick={() => void demonstrate(outcome)}
            className="rounded border bg-white px-4 py-2 disabled:opacity-50"
          >
            Demonstrate {outcome} checkout
          </button>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
