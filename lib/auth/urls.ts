export function applicationOrigin(requestUrl: string, config: {
  appUrl?: string;
  vercelEnv?: string;
  vercelUrl?: string;
  nodeEnv?: string;
}) {
  if (config.nodeEnv === "production" && !config.appUrl && !config.vercelUrl) {
    throw new Error("Configure the application origin before sending authentication emails.");
  }
  // A verified application URL is more stable than VERCEL_URL, which is a
  // protected, per-build preview address. Public invitation and recovery links
  // must use the branch-specific, publicly accessible application domain.
  const candidate = config.appUrl || (config.vercelUrl
    ? `https://${config.vercelUrl}`
    : new URL(requestUrl).origin);
  const url = new URL(candidate);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("A secure application URL is required.");
  }
  return url.origin;
}
