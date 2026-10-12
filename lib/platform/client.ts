import { supabase } from "@/lib/supabase";
export async function platformFetch<T>(path:string,init:RequestInit={}):Promise<T> {
  const { data:{ session } }=await supabase.auth.getSession();
  if (!session) throw new Error("Sign in again to continue.");
  const headers=new Headers(init.headers);headers.set("Authorization",`Bearer ${session.access_token}`);
  const response=await fetch(path,{ ...init,headers,cache:"no-store" });const body=await response.json();
  if (!response.ok) throw new Error(body.error || "The platform operation could not be completed.");
  return body;
}
