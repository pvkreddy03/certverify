// Offline configuration checks only: no keys, URLs or provider responses are logged.
export function hostedPreflight(env: Record<string, string | undefined>) {
  const failures: string[] = [];
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_APP_URL", "CERTVERIFY_SANDBOX_PROJECT_REF", "CERTVERIFY_RATE_LIMIT_SECRET"];
  for (const name of required) if (!env[name]?.trim()) failures.push(`${name}: missing`);
  if (env.CERTVERIFY_DEPLOYMENT_TARGET !== "isolated_sandbox") failures.push("Deployment target must be isolated_sandbox");
  if (env.VERCEL_ENV !== "preview") failures.push("VERCEL_ENV must be preview");
  const ref = env.CERTVERIFY_SANDBOX_PROJECT_REF ?? "";
  if (!/^[a-z0-9]{20}$/.test(ref)) failures.push("Sandbox project reference must be a Supabase project ID");
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co`) failures.push("Supabase URL must exactly match the approved sandbox reference");
  try {
    const url = new URL(env.NEXT_PUBLIC_APP_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.port || url.hostname === "localhost" || /^[\d.]+$/.test(url.hostname)) throw new Error();
  } catch { failures.push("Application URL must be a canonical public HTTPS origin"); }
  if ((env.CERTVERIFY_RATE_LIMIT_SECRET?.length ?? 0) < 32) failures.push("Rate-limit secret must contain at least 32 characters");
  const mode = env.CERTVERIFY_PAYMENT_MODE;
  if (mode && !["disabled", "razorpay_test"].includes(mode)) failures.push("Only disabled or razorpay_test payment mode is permitted");
  if (mode === "razorpay_test") {
    if (!/^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_TEST_KEY_ID ?? "")) failures.push("Razorpay key ID must be a test key");
    for (const key of ["RAZORPAY_TEST_KEY_SECRET", "RAZORPAY_TEST_WEBHOOK_SECRET"]) if (!env[key]?.trim()) failures.push(`${key}: missing`);
  }
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith("NEXT_PUBLIC_") && /SECRET|SERVICE_ROLE|DATABASE_URL|ACCESS_TOKEN|WEBHOOK|PASSWORD/.test(name) && value) failures.push(`${name}: prohibited public secret binding`);
  }
  return { mode: "offline-only", readyForHostedVerification: failures.length === 0, failures, hostedIntegrationVerified: false };
}
