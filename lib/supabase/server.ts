import { verifyPrivilegedCredentials } from "../hosting/isolation";
import { createClient } from "@supabase/supabase-js";
import { RequestError } from "../auth/request";

// Call only after user authorization or verified gateway authentication.
// Importing a route must not create a privileged client or require its secret.
export async function getSupabaseAdmin() {
  try {
    await verifyPrivilegedCredentials(process.env);
  } catch {
    throw new RequestError("This service is temporarily unavailable. Staging server credentials need verification.", 503);
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
