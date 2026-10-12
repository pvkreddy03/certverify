import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { ACCOUNT_HEADER, isAccountId } from "@/lib/accounts/context";

export async function serverSession(accountId?: string | null) {
  const store=await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
    global:{ headers:isAccountId(accountId) ? { [ACCOUNT_HEADER]:accountId } : {} },
    cookies:{ getAll:()=>store.getAll(),setAll:(updates)=>{
      // Server components cannot write cookies; Route Handlers can.
      try { for (const update of updates) store.set(update.name,update.value,update.options); } catch {}
    } },
  });
}
