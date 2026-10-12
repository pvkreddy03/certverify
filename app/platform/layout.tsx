import { redirect } from "next/navigation";
import { serverSession } from "@/lib/auth/server-session";

export default async function PlatformLayout({ children }: { children:React.ReactNode }) {
  const client=await serverSession();const { data:{ user },error }=await client.auth.getUser();
  if (error || !user) redirect("/login?next=/platform/branding");
  const identity=await client.rpc("cv_platform_identity");
  if (identity.error || identity.data!==true) redirect("/dashboard");
  return children;
}
