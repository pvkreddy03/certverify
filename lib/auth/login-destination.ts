// Only a verified server-side role check can select the platform portal.
export function loginDestination(requested: string | null, origin: string, platform = false) {
  const fallback = platform ? "/platform" : "/dashboard";
  if (!requested || requested.length > 2048) return fallback;

  try {
    const next = new URL(requested, origin);
    if (next.origin !== origin) return fallback;
    const path = next.pathname;

    // Retain invitation acceptance; customer sessions cannot request platform access.
    if (!platform) return path === "/accept-invite" ? path + next.search : fallback;

    const allowed = [
      "/platform", "/platform/accounts", "/platform/branding",
      "/platform/audit", "/platform/subscriptions", "/platform/pricing",
      "/platform/contact", "/platform/payments",
    ].includes(path) ||
      /^\/platform\/accounts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path);
    return allowed ? path + next.search : fallback;
  } catch {
    return fallback;
  }
}
