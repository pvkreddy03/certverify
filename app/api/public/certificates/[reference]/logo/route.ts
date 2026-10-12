import { createClient } from "@supabase/supabase-js";
import { logoResponse } from "@/lib/branding/server";
import { requestErrorResponse, RequestError } from "@/lib/auth/request";

export async function GET(_request: Request,{ params }: { params:Promise<{ reference:string }> }) {
  try {
    const { reference }=await params;
    const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{ auth:{ persistSession:false,autoRefreshToken:false } });
    const { data,error }=await client.rpc("cv_public_logo_path",{ p_reference:reference });
    if (error || typeof data!=="string") throw new RequestError("Logo unavailable.",404);
    return await logoResponse(data,true);
  } catch(error) { return requestErrorResponse(error); }
}
