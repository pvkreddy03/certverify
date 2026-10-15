import Link from "next/link";
import { redirect } from "next/navigation";
import { PlatformMfa } from "@/components/platform-mfa";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { serverSession } from "@/lib/auth/server-session";

export default async function AccountSecurityPage() {
  const client = await serverSession();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/confirm-email");
  return <><DashboardNavigation/><main className="mx-auto max-w-xl space-y-6 p-6">
    <h1 className="text-2xl font-semibold">Account security</h1>
    <p>Set up an authenticator for your own account. Keep its setup QR private. MFA enrollment does not grant platform administrator privileges.</p>
    <PlatformMfa accountSecurity><p role="status">Your authenticator is verified for this session. Platform access requires a separate approved administrator grant.</p></PlatformMfa>
    <Link href="/dashboard" className="text-blue-700">Return to dashboard</Link>
  </main></>;
}
