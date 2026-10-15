"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { chooseAccount, selectedAccountId, type AccountMembership } from "@/lib/accounts/context";

const customerRoutes = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/certificates", label: "Create certificate" },
  { href: "/dashboard/certificates/list", label: "Certificates" },
  { href: "/dashboard/templates", label: "Templates" },
  { href: "/dashboard/team", label: "Team", managerOnly: true },
  { href: "/dashboard/branding", label: "Branding" },
  { href: "/dashboard/subscription", label: "Subscription", ownerOnly: true },
  { href: "/dashboard/settings", label: "Settings" },
  { href: "/account/security", label: "Security" },
] as const;

function currentRoute(pathname: string) {
  if (/^\/dashboard\/certificates\/[0-9a-f-]{36}$/i.test(pathname)) return "/dashboard/certificates/list";
  if (pathname.startsWith("/dashboard/templates/")) return "/dashboard/templates";
  return pathname;
}

type Props = {
  role?: AccountMembership["role"];
  accounts?: AccountMembership[];
  selectedAccountId?: string;
  onAccountChange?: (id: string) => void;
};

export function DashboardNavigation({ role, accounts = [], selectedAccountId: selected, onAccountChange }: Props) {
  const pathname = usePathname();
  const [resolvedRole, setResolvedRole] = useState<AccountMembership["role"] | null>(null);
  const active = currentRoute(pathname);

  // Security lives outside /dashboard. Verify its role before displaying
  // management links; client-only hints never authorize the underlying route.
  useEffect(() => {
    if (role !== undefined) return;
    let live = true;
    void supabase.rpc("cv_list_accounts").then(({ data, error }) => {
      if (!live) return;
      const membership = !error ? chooseAccount((data ?? []) as AccountMembership[], selectedAccountId()) : null;
      setResolvedRole(membership?.role ?? null);
    });
    return () => { live = false; };
  }, [role]);

  const membershipRole = role ?? resolvedRole;
  const routes = customerRoutes.filter((route) => {
    if ("ownerOnly" in route && route.ownerOnly) return membershipRole === "owner";
    if ("managerOnly" in route && route.managerOnly) return membershipRole === "owner" || membershipRole === "admin";
    return true;
  });

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
            onChange={(event) => window.location.assign(event.target.value)}
            className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900"
          >
            {routes.map((item) => <option value={item.href} key={item.href}>{item.label}</option>)}
          </select>
        </div>
        <div className="hidden flex-1 flex-wrap items-center gap-1 md:flex">
          {routes.filter((item) => item.href !== "/dashboard").map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${active === item.href
                ? "bg-blue-100 text-blue-900 ring-1 ring-blue-200"
                : "text-slate-600 hover:bg-blue-50 hover:text-blue-900"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        {accounts.length > 1 && selected && onAccountChange && (
          <label className="ml-auto flex max-w-48 shrink-0 items-center gap-2 text-xs font-medium text-slate-500">
            <span className="sr-only">Workspace</span>
            <select
              aria-label="Workspace"
              value={selected}
              onChange={(event) => onAccountChange(event.target.value)}
              className="max-w-48 rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm font-semibold text-slate-800"
            >
              {accounts.map((account) => <option value={account.id} key={account.id}>{account.account_name}</option>)}
            </select>
          </label>
        )}
      </div>
    </nav>
  );
}
