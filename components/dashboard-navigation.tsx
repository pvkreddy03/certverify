"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/certificates/list", label: "Certificates" },
  { href: "/dashboard/certificates", label: "Create certificate" },
  { href: "/dashboard/templates", label: "Templates" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/branding", label: "Branding" },
  { href: "/dashboard/subscription", label: "Subscription" },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/account/security", label: "Security" },
];

export function DashboardNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Customer dashboard pages" className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 py-2 sm:flex-wrap sm:overflow-visible">
        {items.map(({ href, label }) => {
          const active = pathname === href || (
            href === "/dashboard/certificates/list" &&
            /^\/dashboard\/certificates\/[0-9a-f-]{36}$/i.test(pathname)
          ) || (
            href === "/dashboard/templates" && pathname.startsWith("/dashboard/templates/")
          );
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${active ? "bg-blue-100 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
