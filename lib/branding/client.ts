import { supabase } from "@/lib/supabase";
import { accountHeaders } from "@/lib/accounts/context";

export async function brandingFetch(path:string,init:RequestInit={}) {
  const { data:{ session } }=await supabase.auth.getSession();
  if (!session) throw new Error("Sign in again to continue.");
  const headers=accountHeaders(init.headers);
  headers.set("Authorization",`Bearer ${session.access_token}`);
  const response=await fetch(path,{ ...init,headers,cache:"no-store" });
  const data=await response.json();
  if (!response.ok) throw new Error(data.error || "The branding operation could not be completed.");
  return data;
}
