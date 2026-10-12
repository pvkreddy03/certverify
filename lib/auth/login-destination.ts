export function loginDestination(requested:string|null,origin:string,platform=false) {
  const fallback=platform ? "/platform" : "/dashboard";
  if (!requested || requested.length>2048) return fallback;
  try {
    const next=new URL(requested,origin);
    if (next.origin!==origin) return fallback;
    const allowed=["/accept-invite","/platform","/platform/accounts","/platform/branding","/platform/audit","/platform/subscriptions","/platform/pricing"].includes(next.pathname)
      || /^\/platform\/accounts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(next.pathname);
    return allowed ? next.pathname+next.search : fallback;
  } catch { return fallback; }
}
