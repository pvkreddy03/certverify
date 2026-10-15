/**
 * QR links must use a stable, publicly reachable verification host.
 *
 * NEXT_PUBLIC_VERIFICATION_ORIGIN can be configured independently of the login\n * domain when the business purchases its long-lived verification domain.\n * NEXT_PUBLIC_APP_URL is scoped to each Vercel environment. For preview tests
 * it is the unprotected branch domain, not VERCEL_URL. In local development,
 * use the current app origin. A change of hosting provider should require only
 * a configuration change (and the same public domain), not QR rewrites.
 */
export function publicVerificationUrl(reference: string, fallbackOrigin: string): string {
  const configured = process.env.NEXT_PUBLIC_VERIFICATION_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  const origin = new URL(configured || fallbackOrigin);
  const isLocal = ["localhost", "127.0.0.1"].includes(origin.hostname);
  if (origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/" || (origin.protocol !== "https:" && !(isLocal && origin.protocol === "http:"))) {
    throw new Error("A secure public verification URL is required.");
  }
  return `${origin.origin}/verify/${encodeURIComponent(reference)}`;
}
