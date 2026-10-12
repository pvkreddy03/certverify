// Public infrastructure identifier, never a credential. Protected source is immutable.
export const protectedSourceProject = "jhnxztaqfikgvkshifel";
export function isProtectedProject(ref?: string, url?: string) {
  if (ref === protectedSourceProject) return true;
  try { return new URL(url ?? "").hostname === `${protectedSourceProject}.supabase.co`; }
  catch { return false; }
}
export function assertPreviewIsolation(env: Record<string,string|undefined>) {
  if (env.VERCEL_ENV === "production" && env.CERTVERIFY_DEPLOYMENT_TARGET === "isolated_sandbox")
    throw new Error("Sandbox releases must use Preview, never Production.");
  if (env.VERCEL_ENV !== "preview") return;
  const ref = env.CERTVERIFY_SANDBOX_PROJECT_REF;
  if (env.CERTVERIFY_DEPLOYMENT_TARGET !== "isolated_sandbox" || !ref || !/^[a-z0-9]{20}$/.test(ref) || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${ref}.supabase.co` || isProtectedProject(ref,env.NEXT_PUBLIC_SUPABASE_URL))
    throw new Error("Preview build refused: configure a dedicated sandbox project; protected source credentials are forbidden.");
}
