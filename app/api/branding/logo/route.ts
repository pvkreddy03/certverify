import { authenticatedRequest, requestErrorResponse, RequestError } from "@/lib/auth/request";
import { boundedLogoForm } from "@/lib/branding/server";
import { normalizeLogo, LogoValidationError } from "@/lib/branding/logo-validation";
import { LOGO_BUCKET } from "@/lib/branding/types";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { client }=await authenticatedRequest(request);
    const form=await boundedLogoForm(request);
    const file=form.get("logo");
    if (!(file instanceof File)) throw new RequestError("Choose a logo file.",400);
    const normalized=await normalizeLogo(new Uint8Array(await file.arrayBuffer()),file.type);
    const { data:reservation,error }=await client.rpc("cv_reserve_logo");
    if (error || !reservation) throw new RequestError("Logo upload is not authorized or the daily upload limit was reached.",403);
    const { error:uploadError }=await supabaseAdmin.storage.from(LOGO_BUCKET).upload(reservation.path,normalized.bytes,{ contentType:normalized.mime,cacheControl:"31536000",upsert:false });
    if (uploadError) throw new RequestError("The logo could not be stored. Please retry later.",503);
    const { error:finalizeError }=await supabaseAdmin.rpc("cv_finalize_logo",{ p_asset:reservation.id,p_hash:normalized.hash,p_bytes:normalized.bytes.byteLength });
    if (finalizeError) {
      // A transport failure can follow a committed finalization. Retain the
      // immutable object for reviewed reconciliation; never delete evidence
      // based on an ambiguous response from the database.
      throw new RequestError("The upload could not be finalized. Branding has not changed.",503);
    }
    return Response.json({ assetId:reservation.id });
  } catch(error) {
    if (error instanceof LogoValidationError) return Response.json({ error:error.message },{ status:400 });
    return requestErrorResponse(error);
  }
}
