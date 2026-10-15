"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export const customerRoutes = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/certificates", label: "Create certificate" },
  { href: "/dashboard/certificates/list", label: "Certificates" },
  { href: "/dashboard/templates", label: "Templates" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/branding", label: "Branding" },
  { href: "/dashboard/subscription", label: "Subscription" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/account/security", label: "Security" },
] as const;

function currentRoute(pathname: string) {
  if (/^\/dashboard\/certificates\/[0-9a-f-]{36}$/i.test(pathname)) return "/dashboard/certificates/list";
  if (pathname.startsWith("/dashboard/templates/")) return "/dashboard/templates";
  return pathname;
}

export function DashboardNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const active = currentRoute(pathname);

  return (
    <nav aria-label="Customer dashboard pages" className="sticky top-0 z-30 border-b border-blue-100 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
        <Link href="/dashboard" className="shrink-0 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800">
          ← Dashboard
        </Link>
        <div className="relative min-w-0 flex-1 md:hidden">
          <label htmlFor="customer-jump" className="sr-only">Navigate to page</label>
          <select
            id="customer-jump"
            aria-label="Navigate to page"
            value={active}
            onChange={(event) => router.push(event.target.value)}
            className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900"
          >
            {customerRoutes.map((item) => <option value={item.href} key={item.href}>{item.label}</option>)}
          </select>
        </div>
        <div className="hidden flex-1 flex-wrap items-center gap-1 md:flex">
          {customerRoutes.filter((item)=>item.href!=="/dashboard").map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active===item.href ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active===item.href
                ? "bg-blue-100 text-blue-900 ring-1 ring-blue-200"
                : "text-slate-600 hover:bg-blue-50 hover:text-blue-900"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
