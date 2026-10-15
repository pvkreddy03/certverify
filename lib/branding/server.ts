import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authenticatedRequest, RequestError } from "@/lib/auth/request";
import { LOGO_BUCKET, MAX_LOGO_BYTES } from "./types";

export async function platformBrandingContext(request: Request) {
  const context=await authenticatedRequest(request,false);
  const { data,error }=await context.client.rpc("cv_is_platform_admin");
  if (error || data!==true) throw new RequestError("An authorized platform administrator with MFA is required.",403);
  return context;
}
export async function boundedLogoForm(request: Request) {
  const maximum=MAX_LOGO_BYTES+512*1024;
  if (Number(request.headers.get("content-length"))>maximum || !request.body) throw new RequestError("Upload is too large.",413);
  const reader=request.body.getReader(); const chunks:Uint8Array[]=[]; let size=0;
  for (;;) {
    const { done,value }=await reader.read(); if (done) break;
    size+=value.byteLength;
    if (size>maximum) { await reader.cancel(); throw new RequestError("Upload is too large.",413); }
    chunks.push(value);
  }
  return new Response(new Uint8Array(Buffer.concat(chunks)),{ headers:{ "content-type":request.headers.get("content-type") ?? "" } }).formData();
}
export async function logoResponse(path: string, publiclyVisible=false, viewer?: SupabaseClient) {
  // Never fetch a client URL or expose private signed URLs. Paths come from checked RPCs.
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/i.test(path)) throw new RequestError("Logo unavailable.",404);
  // The private Storage bucket authorizes authenticated owners via RLS and
  // anonymous visitors only for logos published in issued certificate snapshots.
  // Never expose a privileged storage key or make the entire bucket public.
  if (!publiclyVisible && !viewer) throw new RequestError("Authentication required.",401);
  const reader = viewer ?? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
      auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
    });
  const { data,error }=await reader.storage.from(LOGO_BUCKET).download(path);
  if (error || !data || data.size>MAX_LOGO_BYTES || data.type!=="image/webp") throw new RequestError("Logo unavailable.",404);
  return new Response(await data.arrayBuffer(),{ headers:{ "Content-Type":"image/webp", "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'; sandbox", "Cache-Control":publiclyVisible ? "public, max-age=300" : "private, no-store" } });
}
