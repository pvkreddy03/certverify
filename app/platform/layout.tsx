import Link from "next/link";
import { redirect } from "next/navigation";
import { serverSession } from "@/lib/auth/server-session";
import { PlatformNavigation } from "@/components/platform-navigation";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const client = await serverSession();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/platform-login");
  const identity = await client.rpc("cv_platform_identity");
  if (identity.error || identity.data !== true) redirect("/dashboard");

  return <div className="min-h-screen bg-[#f2f6fa]">
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-[#0d1b32] text-white shadow-lg">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/platform" className="flex items-center gap-3" aria-label="CertVerify administration home">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-400 text-xl font-black text-slate-900">✓</span>
            <span><span className="block text-lg font-extrabold">CertVerify Control Center</span>
              <span className="block text-xs font-medium text-teal-200">Platform administration · Secure access</span></span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-full border border-teal-300/30 bg-teal-500/15 px-3 py-2 font-semibold text-teal-100">Administrator workspace</span>
            <Link href="/dashboard" className="rounded-xl border border-white/30 px-3 py-2 font-semibold text-white hover:bg-white/10">Customer workspace ↗</Link>
          </div>
        </div>
        <PlatformNavigation />
      </div>
    </header>
    {children}
  </div>;
}
