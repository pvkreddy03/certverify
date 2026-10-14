import type { NextConfig } from "next";
import { assertPreviewIsolation, previewOrigin } from "./lib/hosting/isolation";

assertPreviewIsolation(process.env);

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default async function configuredNext() {
  // Build-time isolation checks are deterministic; do not block compilation on outbound
  // Supabase API availability. Real staging API and privileged credentials are verified
  // during hosted integration/user operations, with no source-project fallback.
  return process.env.VERCEL_ENV === "preview"
    ? { ...nextConfig, env: { NEXT_PUBLIC_APP_URL: previewOrigin(process.env) } }
    : nextConfig;
}
