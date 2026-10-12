import Link from "next/link";
import { redirect } from "next/navigation";
import { serverSession } from "@/lib/auth/server-session";

export default async function PlatformLayout({ children }: { children:React.ReactNode }) {
  const client=await serverSession();const { data:{ user },error }=await client.auth.getUser();
  if (error || !user) redirect("/platform-login");
  const identity=await client.rpc("cv_platform_identity");
  if (identity.error || identity.data!==true) redirect("/dashboard");
  return <><header className="border-b bg-white px-6 py-4"><p className="font-semibold">CertVerify Platform Administration</p><nav aria-label="Platform navigation" className="mt-3 flex flex-wrap gap-5 text-blue-700"><Link href="/platform">Overview</Link><Link href="/platform/accounts">Accounts</Link><Link href="/platform/branding">Branding approvals</Link><Link href="/platform/subscriptions">Subscriptions</Link><Link href="/platform/audit">Administrative history</Link></nav></header>{children}</>;
}
