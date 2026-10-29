import Link from "next/link";
import { redirect } from "next/navigation";
import { PlatformMfa } from "@/components/platform-mfa";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { PasswordSecurity } from "@/components/password-security";
import { serverSession } from "@/lib/auth/server-session";

export default async function AccountSecurityPage() {
  const client = await serverSession();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/confirm-email");
  return <><DashboardNavigation/><main className="cv-page min-h-screen"><div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
    <p className="cv-eyebrow">YOUR SECURITY</p><h1 className="text-3xl font-extrabold tracking-tight text-[#1a304b]">Account security</h1>
    <p>Set up an authenticator for your own account. Keep its setup QR private. MFA enrollment does not grant platform administrator privileges.</p>
    <PasswordSecurity />
    <PlatformMfa accountSecurity><p role="status">Your authenticator is verified for this session. Platform access requires a separate approved administrator grant.</p></PlatformMfa>
    <Link href="/dashboard/settings" className="text-blue-700">← Return to Settings</Link>
  </div></main></>;
}
