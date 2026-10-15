// Public infrastructure identifiers, never credentials.
export const protectedSourceProject = "jhnxztaqfikgvkshifel";
export const approvedStagingProject = "nubohxesjeaodqcveiud";
export function isProtectedProject(ref?: string, url?: string) {
  if (ref === protectedSourceProject) return true;
  try { return new URL(url ?? "").hostname === `${protectedSourceProject}.supabase.co`; }
  catch { return false; }
}
function claims(key: string) {
  try {
    const parts = key.split(".");
    if (parts.length !== 3 || !parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p))) return null;
    return JSON.parse(atob(parts[1].replaceAll("-","+").replaceAll("_","/"))) as { role?: string; ref?: string };
  } catch { return null; }
}
export function credentialMatchesProject(key: string | undefined, role: "anon" | "service_role", ref: string) {
  if (!key || key !== key.trim()) return false;
  const prefix = role === "anon" ? "sb_publishable_" : "sb_secret_";
  if (key.startsWith(prefix)) return /^[A-Za-z0-9_-]{16,}$/.test(key.slice(prefix.length));
  const parsed = claims(key);
  // Format/claim checks only. Provider signature and actual access are checked separately.
  return parsed?.role === role && parsed?.ref === ref;
}
export function serverSecretValues(env: Record<string,string|undefined>): string[] {
  // A common misconfiguration copies the public key into the private binding.
  // It remains unusable for privileged calls, but is not a confidential value.
  // Only exempt the exact approved public credential in a pinned Preview; unknown
  // values and every real service-role/secret credential remain leak candidates.
  const duplicatedPublicKey = env.VERCEL_ENV === "preview" &&
    env.CERTVERIFY_SANDBOX_PROJECT_REF === approvedStagingProject &&
    env.NEXT_PUBLIC_SUPABASE_URL === `https://${approvedStagingProject}.supabase.co` &&
    env.SUPABASE_SECRET_KEY === env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    credentialMatchesProject(env.SUPABASE_SECRET_KEY,"anon",approvedStagingProject);
  return [duplicatedPublicKey ? undefined : env.SUPABASE_SECRET_KEY,
    env.RAZORPAY_TEST_KEY_SECRET,env.RAZORPAY_TEST_WEBHOOK_SECRET,env.CERTVERIFY_RATE_LIMIT_SECRET]
    .filter((value): value is string=>Boolean(value));
}
export function previewOrigin(env: Record<string,string|undefined>) {
  const host = env.VERCEL_URL;
  if (!host || !/^certverify(?:-[a-z0-9-]+)?-pvkreddy03\.vercel\.app$/i.test(host))
    throw new Error("Preview requires the Vercel-provided deployment hostname.");
  const origin = `https://${host}`;
  // CertVerify's reviewed staging branch has its own public domain for QR
  // verification and invitation links. All other origins, particularly an
  // inherited Production domain or arbitrary attacker domain, remain rejected.
  const publicStaging = "https://certverify-staging.vercel.app";
  const configured = env.NEXT_PUBLIC_APP_URL?.replace(/\/$/,"");
  if (configured && configured !== origin && configured !== publicStaging)
    throw new Error("Preview application origin must match this deployment or the approved public staging domain.");
  return configured === publicStaging ? publicStaging : origin;
}
export function assertPreviewIsolation(env: Record<string,string|undefined>) {
  if (env.VERCEL_ENV === "production" && env.CERTVERIFY_DEPLOYMENT_TARGET === "isolated_sandbox")
    throw new Error("Sandbox releases must use Preview, never Production.");
  if (env.VERCEL_ENV !== "preview") return;
  const ref = env.CERTVERIFY_SANDBOX_PROJECT_REF;
  if (env.CERTVERIFY_DEPLOYMENT_TARGET !== "isolated_sandbox" || ref !== approvedStagingProject || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${approvedStagingProject}.supabase.co` || isProtectedProject(ref,env.NEXT_PUBLIC_SUPABASE_URL))
    throw new Error("Preview build refused: configure the approved staging project; protected source credentials are forbidden.");
  if (!credentialMatchesProject(env.NEXT_PUBLIC_SUPABASE_ANON_KEY,"anon",ref))
    throw new Error("Preview public credential configuration is missing, invalid or belongs to another project.");
  const privateKeys = serverSecretValues(env);
  for (const [name,value] of Object.entries(env)) if (name.startsWith("NEXT_PUBLIC_") && value &&
    (/SECRET|SERVICE_ROLE|DATABASE_URL|ACCESS_TOKEN|WEBHOOK|PASSWORD/.test(name) || value.startsWith("sb_secret_") || claims(value)?.role === "service_role" || privateKeys.includes(value)))
    throw new Error("Preview contains a prohibited public secret binding.");
  if ((env.CERTVERIFY_RATE_LIMIT_SECRET?.length ?? 0)<32)
    throw new Error("Preview requires its private request-budget secret.");
  if (env.RAZORPAY_TEST_KEY_ID?.startsWith("rzp_live_"))
    throw new Error("Live gateway credentials are prohibited in Preview.");
  if (env.CERTVERIFY_PAYMENT_MODE && !["disabled","razorpay_test"].includes(env.CERTVERIFY_PAYMENT_MODE))
    throw new Error("Live payment mode is prohibited.");
  if (env.CERTVERIFY_PAYMENT_MODE === "razorpay_test" && (!/^rzp_test_[A-Za-z0-9]+$/.test(env.RAZORPAY_TEST_KEY_ID ?? "") || !env.RAZORPAY_TEST_KEY_SECRET || !env.RAZORPAY_TEST_WEBHOOK_SECRET || (env.CERTVERIFY_RATE_LIMIT_SECRET?.length ?? 0)<32))
    throw new Error("Preview test-payment configuration is incomplete or uses a live key.");
  if (env.NEXT_PUBLIC_VERIFICATION_ORIGIN &&
      env.NEXT_PUBLIC_VERIFICATION_ORIGIN !== "https://certverify-staging.vercel.app")
    throw new Error("Preview verification links must use the approved public staging origin.");
  previewOrigin(env);
}
export async function verifyPreviewCredentials(env: Record<string,string|undefined>, request: typeof fetch = fetch) {
  assertPreviewIsolation(env);
  if (env.VERCEL_ENV !== "preview") return;
  try {
    // Read-only verification at one pinned host. Never follow credential-bearing redirects,
    // fetch source data, read/log user contents, or mutate Auth/database configuration.
    // Compilation needs only the public client. The server key is validated
    // when an authorized operation requests privileged access, never on import.
    for (const [path,key] of [["/rest/v1/",env.NEXT_PUBLIC_SUPABASE_ANON_KEY]]) {
      const response = await request(`https://${approvedStagingProject}.supabase.co${path}`,{
        method:"GET",headers:{apikey:key!,Authorization:`Bearer ${key}`},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(10000),
      });
      await response.body?.cancel();
      if (response.status !== 200 || !/application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(response.headers.get("content-type") ?? "")) throw new Error();
    }
  } catch {
    throw new Error("Preview credential verification failed at the approved staging project. No build or database fallback is permitted.");
  }
}

export function assertPrivilegedConfiguration(env: Record<string,string|undefined>) {
  assertPreviewIsolation(env);
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    throw new Error("Privileged staging services are not configured.");
  if (env.VERCEL_ENV === "preview" || env.CERTVERIFY_DEPLOYMENT_TARGET === "isolated_sandbox") {
    if (env.CERTVERIFY_SANDBOX_PROJECT_REF !== approvedStagingProject ||
        env.NEXT_PUBLIC_SUPABASE_URL !== `https://${approvedStagingProject}.supabase.co` ||
        !credentialMatchesProject(env.SUPABASE_SECRET_KEY,"service_role",approvedStagingProject))
      throw new Error("Privileged staging credentials are missing, invalid or belong to another project.");
  }
}

export async function verifyPrivilegedCredentials(env: Record<string,string|undefined>, request: typeof fetch = fetch) {
  assertPrivilegedConfiguration(env);
  if (env.VERCEL_ENV !== "preview" && env.CERTVERIFY_DEPLOYMENT_TARGET !== "isolated_sandbox") return;
  try {
    // Opaque sb_secret keys have no readable project claim. Establish server
    // capability at the pinned sandbox before creating the service client.
    // No user payload is parsed, logged, cached or exposed.
    const key = env.SUPABASE_SECRET_KEY!;
    const response = await request(`https://${approvedStagingProject}.supabase.co/auth/v1/admin/users?page=1&per_page=1`,{
      method:"GET", headers:{apikey:key,Authorization:`Bearer ${key}`}, redirect:"error", cache:"no-store", signal:AbortSignal.timeout(10000),
    });
    await response.body?.cancel();
    if (response.status !== 200 || !/application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(response.headers.get("content-type") ?? "")) throw new Error();
  } catch {
    throw new Error("Privileged staging credential verification failed. No database fallback is permitted.");
  }
}
