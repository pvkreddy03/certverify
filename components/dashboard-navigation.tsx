"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { chooseAccount, selectedAccountId, type AccountMembership } from "@/lib/accounts/context";

const customerRoutes = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/dashboard/certificates", label: "Create certificate", icon: "create" },
  { href: "/dashboard/certificates/bulk", label: "Bulk Excel", icon: "bulk" },
  { href: "/dashboard/certificates/list", label: "Certificates", icon: "certificates" },
  { href: "/dashboard/templates", label: "Templates", icon: "templates" },
  { href: "/dashboard/reference-map", label: "Reference Map", icon: "map" },
  { href: "/dashboard/team", label: "Team", icon: "team", managerOnly: true },
  { href: "/dashboard/branding", label: "Branding", icon: "branding", managerOnly: true },
  { href: "/dashboard/subscription", label: "Subscription", icon: "subscription", ownerOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
  { href: "/account/security", label: "Security", icon: "security" },
] as const;

function currentRoute(pathname: string) {
  if (/^\/dashboard\/certificates\/[0-9a-f-]{36}$/i.test(pathname)) return "/dashboard/certificates/list";
  if (pathname.startsWith("/dashboard/certificates/bulk/")) return "/dashboard/certificates/bulk";
  if (pathname.startsWith("/dashboard/templates/")) return "/dashboard/templates";
  return pathname;
}

type Props = {
  role?: AccountMembership["role"];
  accounts?: AccountMembership[];
  selectedAccountId?: string;
  onAccountChange?: (id: string) => void;
};

function NavigationIcon({ kind }: { kind: string }) {
  const shared = {
    fill: "none", stroke: "currentColor", strokeWidth: 1.9,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  const symbols: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 21v-8h6v8"/></>,
    create: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 11v7m-3.5-3.5h7"/></>,
    bulk: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 10v10"/></>,
    certificates: <><path d="M7 3h10l4 4v14H3V3z"/><path d="M17 3v5h4M7 12h10M7 16h7"/></>,
    templates: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/><circle cx="12" cy="11" r="2"/></>,
    team: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 4a3 3 0 0 1 0 6m0 5a5 5 0 0 1 5 5v1"/></>,
    branding: <><path d="M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10"/></>,
    subscription: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-2-2-3-2.7 1A8 8 0 0 0 14 6l-1-3h-3L9 6a8 8 0 0 0-2.2 1L4 6 2 9l2 2a7 7 0 0 0 0 2l-2 2 2 3 2.8-1A8 8 0 0 0 9 18l1 3h3l1-3a8 8 0 0 0 2.2-1l2.8 1 2-3-2-2a7 7 0 0 0 0-1Z"/></>,
    security: <><path d="M12 2 4 5v7c0 5.4 3.5 8.6 8 10 4.5-1.4 8-4.6 8-10V5Z"/><path d="m9 12 2 2 4-4"/></>,
  };
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" {...shared}>{symbols[kind]}</svg>;
}

export function DashboardNavigation({ role, accounts = [], selectedAccountId: selected, onAccountChange }: Props) {
  const pathname = usePathname();
  const [resolvedRole, setResolvedRole] = useState<AccountMembership["role"] | null>(null);
  const active = currentRoute(pathname);

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
    <nav aria-label="Customer dashboard pages" className="sticky top-0 z-30 border-b border-white/10 bg-[#0d1b32] text-white shadow-[0_8px_28px_rgba(9,22,44,.10)]">
      <div className="mx-auto flex max-w-[1380px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <Link href="/dashboard" aria-label="CertVerify dashboard" className="group mr-1 inline-flex shrink-0 items-center gap-3 rounded-xl px-1 py-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#44d2be] to-[#13998e] text-[#092b39] shadow-[0_5px_18px_rgba(44,205,179,.2)]">
            <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 6"/><path d="M3 3h11M3 21h18"/></svg>
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-[16px] font-extrabold tracking-tight">CertVerify<span className="text-[#5be4d0]">.</span></span>
            <span className="text-[10px] font-medium tracking-[.13em] text-[#9ab7c7]">WORKSPACE</span>
          </span>
        </Link>

        <div className="min-w-0 flex-1 md:hidden">
          <label htmlFor="customer-jump" className="sr-only">Navigate to page</label>
          <select id="customer-jump" aria-label="Navigate to page" value={active}
            onChange={e=>window.location.assign(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-[#1a2e49] px-3 py-2.5 text-sm font-semibold text-white">
            {routes.map(item=><option value={item.href} key={item.href}>{item.label}</option>)}
          </select>
        </div>

        <div className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto py-0.5 md:flex" style={{scrollbarWidth:"thin"}}>
          {routes.map(item=>{
            const highlighted=active===item.href;
            return <Link key={item.href} href={item.href} aria-current={highlighted?"page":undefined}
              className={"inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold tracking-[-.005em] whitespace-nowrap " +
                (highlighted?"bg-[#244759] text-[#86f3dd] shadow-inner ring-1 ring-[#3b6b75]":"text-[#c1d3df] hover:bg-white/10 hover:text-white")}>
              <NavigationIcon kind={item.icon}/>{item.label}
            </Link>;
          })}
        </div>

        {accounts.length > 1 && selected && onAccountChange && (
          <label className="ml-auto flex max-w-56 shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[.07] px-2.5 py-1.5 text-xs font-medium text-[#9ad5cd]">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h10M7 12h10M7 16h7"/></svg>
            <span className="sr-only">Workspace</span>
            <select aria-label="Workspace" value={selected} onChange={e=>onAccountChange(e.target.value)}
              className="min-w-0 max-w-[160px] bg-transparent py-1 text-sm font-semibold text-white outline-none [&_option]:text-slate-900">
              {accounts.map(account=><option value={account.id} key={account.id}>{account.account_name}</option>)}
            </select>
          </label>
        )}
      </div>
    </nav>
  );
}
