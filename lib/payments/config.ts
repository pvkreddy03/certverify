import { PaymentError } from "./types";
import { razorpay } from "./razorpay";
export function configuredGateway() {
  if (process.env.CERTVERIFY_PAYMENT_MODE !== "razorpay_test")
    throw new PaymentError(
      "Payment collection is disabled. No charge was initiated.",
    );
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.CERTVERIFY_DEPLOYMENT_TARGET !== "isolated_sandbox"
  )
    throw new PaymentError(
      "Production payment collection is disabled. Use an explicitly isolated sandbox.",
    );
  return razorpay({
    keyId: process.env.RAZORPAY_TEST_KEY_ID ?? "",
    keySecret: process.env.RAZORPAY_TEST_KEY_SECRET ?? "",
    webhookSecret: process.env.RAZORPAY_TEST_WEBHOOK_SECRET ?? "",
  });
}
