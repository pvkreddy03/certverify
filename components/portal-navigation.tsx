import Link from "next/link";

type Portal = "customer" | "platform";

/**
 * A portal-aware escape route for signup, recovery, confirmation and login.
 * Never points customers at platform login or platform admins at customer login.
 * Protected dashboards retain their own authentication and authorization gates.
 */
export function PortalNavigation({ portal = "customer" }: { portal?: Portal }) {
  const isPlatform = portal === "platform";
  return (
    <nav aria-label={isPlatform ? "Platform navigation" : "Customer navigation"}
      className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-end gap-5 px-6 py-4 text-sm font-semibold text-blue-700">
      <Link href={isPlatform ? "/platform" : "/dashboard"} className="hover:underline">
        {isPlatform ? "Platform dashboard" : "Dashboard"}
      </Link>
      <Link href={isPlatform ? "/platform-login" : "/login"} className="hover:underline">
        {isPlatform ? "Platform sign in" : "Customer sign in"}
      </Link>
    </nav>
  );
}
