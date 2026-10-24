import { createClient } from "@supabase/supabase-js";

/**
 * Public verification contract. Other database backends must implement exactly
 * this output without leaking nonpublic certificate fields.
 */
export type PublicCertificate = {
  certificate_id: string;
  public_verification_id: string;
  issuer_name: string | null;
  issuer_details?: string;
  logo_available?: boolean;
  branding_reconciled?: boolean;
  issued_at: string;
  status: string;
  revoked_at: string | null;
  public_revocation_reason: string | null;
  fields: { id: string; field_name: string; field_type: string; field_value: string | null }[];
};

export interface PublicVerificationRepository {
  findByReference(reference: string): Promise<PublicCertificate | null>;
  findLogoPath(reference: string): Promise<string | null>;
}

// Configuration errors are distinct from a genuine nonexistent certificate.
// A provider failure must NEVER return "Invalid" or "Not Found".
export class PublicVerificationUnavailable extends Error {
  constructor() { super("Public verification is temporarily unavailable."); }
}

function supabasePublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new PublicVerificationUnavailable();
  return createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,cache:"no-store"})},
  });
}

export class SupabasePublicVerificationRepository implements PublicVerificationRepository {
  async findByReference(reference: string) {
    const {data,error}=await supabasePublicClient().rpc("cv_public_certificate",{p_reference:reference});
    if(error) throw new PublicVerificationUnavailable();
    return data as PublicCertificate | null;
  }
  async findLogoPath(reference:string) {
    const {data,error}=await supabasePublicClient().rpc("cv_public_logo_path",{p_reference:reference});
    if(error) throw new PublicVerificationUnavailable();
    return typeof data==="string" ? data : null;
  }
}

/**
 * Keep the provider selection in this one place. Fail closed for unimplemented
 * choices; don't silently substitute an unreviewed database or credentials.
 */
export function publicVerificationRepository(): PublicVerificationRepository {
  const provider = process.env.CERTVERIFY_VERIFICATION_PROVIDER || "supabase";
  if(provider==="supabase") return new SupabasePublicVerificationRepository();
  throw new PublicVerificationUnavailable();
}
