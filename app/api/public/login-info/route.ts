import { createClient } from "@supabase/supabase-js";
import { assertPreviewIsolation } from "@/lib/hosting/isolation";

// Anonymous, read-only storefront data. Never use a privileged service key here.
export async function GET() {
  try {
    assertPreviewIsolation(process.env);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return Response.json({ error: "Public information unavailable." }, { status: 503 });
    const client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await client.rpc("cv_public_login_information");
    if (!error && data && typeof data === "object" && !Array.isArray(data)) {
      return Response.json(data, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    // A backward-compatible read for older staging schemas. It exposes only
    // already-public, active, visible plans; offers/contacts require the reviewed migration.
    if (error?.code === "PGRST202" || error?.code === "42883") {
      const fallback = await client.rpc("cv_pricing_catalog");
      if (!fallback.error) return Response.json({ plans: fallback.data ?? [], offers: [], contact: {} }, { headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ error: "Public information unavailable." }, { status: 503 });
  } catch {
    return Response.json({ error: "Public information unavailable." }, { status: 503 });
  }
}
