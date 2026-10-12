export function applicationOrigin(requestUrl: string, config: {
  appUrl?: string;
  vercelEnv?: string;
  vercelUrl?: string;
  nodeEnv?: string;
}) {
  if (config.nodeEnv === "production" && !config.appUrl && !config.vercelUrl) {
    throw new Error("Configure the application origin before sending authentication emails.");
  }
  const candidate = config.vercelEnv === "preview" && config.vercelUrl
    ? `https://${config.vercelUrl}` : config.appUrl || (config.nodeEnv === "production" && config.vercelUrl ? `https://${config.vercelUrl}` : new URL(requestUrl).origin);
  const url = new URL(candidate);
  if (url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("A secure application URL is required.");
  }
  return url.origin;
}
