export type PaymentSnapshot = {
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "failed" | "refunded";
  refunded: number;
};
export type OrderSnapshot = {
  id: string;
  receipt: string;
  amount: number;
  currency: string;
  status: string;
};
export type PaymentNotice = {
  id: string;
  paymentId: string;
  type: "payment" | "dispute";
};
export type PaymentGateway = {
  readonly name: string;
  readonly capabilities: {
    recurringMandates: boolean;
    partialRefunds: boolean;
    cancelOrder: boolean;
  };
  createOrder(input: {
    receipt: string;
    amount: number;
    currency: string;
  }): Promise<OrderSnapshot>;
  fetchOrder(id: string): Promise<OrderSnapshot>;
  fetchOrderPayments(id: string): Promise<string[]>;
  fetchPayment(id: string): Promise<PaymentSnapshot>;
  refund(input: {
    paymentId: string;
    amount: number;
    reference: string;
  }): Promise<{ id: string }>;
  verifyCallback(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean;
  verifyWebhook(
    raw: Uint8Array,
    signature: string,
    eventId: string,
  ): PaymentNotice;
};
export class PaymentError extends Error {
  constructor(message = "Payment verification is unavailable.") {
    super(message);
  }
}
