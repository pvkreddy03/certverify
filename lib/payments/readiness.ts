import { assertPreviewIsolation, assertPrivilegedConfiguration, approvedStagingProject } from "@/lib/hosting/isolation";

/**
 * Read-only configuration inspection. This never contacts Razorpay, initiates
 * a payment, returns credentials, or asserts that a simulated charge succeeded.
 */
export function paymentTestReadiness(env:Record<string,string|undefined>) {
  const safe = { testOnly: true as const, livePaymentsEnabled: false as const };
  if (env.CERTVERIFY_PAYMENT_MODE !== "razorpay_test") {
    return { ...safe, mode: "disabled" as const, configured: false, message: "Razorpay test checkout is not enabled. The checkout demonstration does not collect payments or activate subscriptions." };
  }
  try {
    if (env.VERCEL_ENV !== "preview" ||
        env.CERTVERIFY_DEPLOYMENT_TARGET !== "isolated_sandbox" ||
        env.CERTVERIFY_SANDBOX_PROJECT_REF !== approvedStagingProject ||
        env.NEXT_PUBLIC_SUPABASE_URL !== `https://${approvedStagingProject}.supabase.co`) {
      throw new Error("Not the approved staging project.");
    }
    assertPreviewIsolation(env);
    assertPrivilegedConfiguration(env);
    if (!/^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_TEST_KEY_ID ?? "") ||
        !env.RAZORPAY_TEST_KEY_SECRET ||
        !env.RAZORPAY_TEST_WEBHOOK_SECRET) {
      throw new Error("Missing Razorpay test settings.");
    }
    return { ...safe, mode: "razorpay_test" as const, configured: true, message: "Razorpay test settings are present. Complete a simulated checkout and verify captured status and webhooks before considering the integration tested." };
  } catch {
    return { ...safe, mode: "incomplete" as const, configured: false, message: "Razorpay test settings are incomplete or the environment is not isolated. No payment will be initiated." };
  }
}
