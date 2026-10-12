export type CheckoutIntent = {
  id: string;
  accountId: string;
  amountMinor: number;
  currency: string;
  quoteId: string;
};
export type VerifiedPaymentEvent = {
  provider: "razorpay" | "phonepe";
  eventId: string;
  intentId: string;
  status: "paid" | "failed";
  amountMinor: number;
  currency: string;
};
export interface BillingProvider {
  readonly name: string;
  createCheckout(intent: CheckoutIntent): Promise<{ checkoutUrl: string }>;
  verifyWebhook(
    rawBody: Uint8Array,
    headers: Headers,
  ): Promise<VerifiedPaymentEvent>;
}
export class PaymentsUnavailable extends Error {
  constructor() {
    super(
      "Payment collection is not enabled. Your selection does not activate paid access or initiate a charge.",
    );
  }
}
export const disabledProvider: BillingProvider = {
  name: "unconfigured",
  async createCheckout() {
    throw new PaymentsUnavailable();
  },
  async verifyWebhook() {
    throw new PaymentsUnavailable();
  },
};
// No provider SDK, credentials, checkout route or settlement API is active in Stage 5.
// Stage 6 must verify signatures, amount/currency, intent identity and idempotency before settlement.
