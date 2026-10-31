"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { chooseAccount, selectedAccountId, type AccountMembership } from "@/lib/accounts/context";

type NavItem = { href: string; label: string; icon: string; ownerOnly?: boolean; managerOnly?: boolean };
type NavGroup = { label: string; icon: string; items: NavItem[] };
type MenuItem = NavItem | NavGroup;

const menu: MenuItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" },
  { href: "/dashboard/certificates", label: "Create Certificate", icon: "create" },
  { label: "My Certificates", icon: "certificates", items: [
    { href: "/dashboard/certificates/list", label: "My Certificates", icon: "certificates" },
    { href: "/dashboard/reports", label: "My Reports", icon: "reports" },
    { href: "/dashboard/my-cover-letters", label: "My Cover Letters", icon: "reports" },
  ] },
  { label: "Templates & Formats", icon: "templates", items: [
    { href: "/dashboard/templates", label: "Templates", icon: "templates" },
    { href: "/dashboard/report-formats", label: "Report Formats", icon: "reports" },
    { href: "/dashboard/cover-letters", label: "Create Cover Letter", icon: "reports" },
    { href: "/dashboard/my-cover-letters", label: "My Cover Letters", icon: "reports" },
  ] },
  { href: "/dashboard/reference-map", label: "Reference Map", icon: "map" },
  { href: "/dashboard/team", label: "Team", icon: "team", managerOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

function isGroup(item: MenuItem): item is NavGroup { return "items" in item; }
function permitted(item: NavItem, role: AccountMembership["role"] | null): boolean {
  if (item.ownerOnly) return role === "owner";
  if (item.managerOnly) return role === "owner" || role === "admin";
  return true;
}
function currentRoute(pathname: string) {
  if (/^\/dashboard\/certificates\/[0-9a-f-]{36}$/i.test(pathname)) return "/dashboard/certificates/list";
  if (pathname.startsWith("/dashboard/certificates/bulk")) return "/dashboard/certificates";
  if (pathname.startsWith("/dashboard/templates/") && pathname.includes("/report")) return "/dashboard/report-formats";
  if (pathname.startsWith("/dashboard/templates/")) return "/dashboard/templates";
  if (pathname === "/dashboard/subscription" || pathname.startsWith("/dashboard/subscription/")) return "/dashboard/settings";
  if (pathname === "/dashboard/branding" || pathname === "/account/security") return "/dashboard/settings";
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
    certificates: <><path d="M7 3h10l4 4v14H3V3z"/><path d="M17 3v5h4M7 12h10M7 16h7"/></>,
    templates: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/><circle cx="12" cy="11" r="2"/></>,
    reports: <><path d="M6 3h9l5 5v13H6z"/><path d="M15 3v6h5M9 13h8M9 17h8"/></>,
    team: <><circle cx="9" cy="8" r="3"/><path d="M2 21v-2a7 7 0 0 1 14 0v2M17 4a3 3 0 0 1 0 6m0 5a5 5 0 0 1 5 5v1"/></>,
    subscription: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-2-2-3-2.7 1A8 8 0 0 0 14 6l-1-3h-3L9 6a8 8 0 0 0-2.2 1L4 6 2 9l2 2a7 7 0 0 0 0 2l-2 2 2 3 2.8-1A8 8 0 0 0 9 18l1 3h3l1-3a8 8 0 0 0 2.2-1l2.8 1 2-3-2-2a7 7 0 0 0 0-1Z"/></>,
  };
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" {...shared}>{symbols[kind]}</svg>;
}

function Chevron() {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m6 9 6 6 6-6"/></svg>;
}

export function DashboardNavigation({ role, accounts = [], selectedAccountId: selected, onAccountChange }: Props) {
  const pathname = usePathname();
  const [resolvedRole, setResolvedRole] = useState<AccountMembership["role"] | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const firstMenu = useRef<HTMLDetailsElement>(null);
  const secondMenu = useRef<HTMLDetailsElement>(null);
  const mobileMenu = useRef<HTMLDetailsElement>(null);
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

  useEffect(() => {
    firstMenu.current?.removeAttribute("open");
    secondMenu.current?.removeAttribute("open");
    mobileMenu.current?.removeAttribute("open");
  }, [pathname]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      for (const item of [firstMenu.current, secondMenu.current, mobileMenu.current]) {
        if (item && target && !item.contains(target)) item.removeAttribute("open");
      }
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        firstMenu.current?.removeAttribute("open");
        secondMenu.current?.removeAttribute("open");
        mobileMenu.current?.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);

  const membershipRole = role ?? resolvedRole;
  const visible = menu.map(item => isGroup(item) ? {
    ...item, items: item.items.filter(route => permitted(route, membershipRole)),
  } : item).filter(item => isGroup(item) ? item.items.length > 0 : permitted(item, membershipRole));

  const mobileGroups = visible.flatMap(item => isGroup(item) ? [{ group: item.label, options: item.items }] : [{ group: "", options: [item] }]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.assign("/login");
    } catch {
      setSignOutError("Sign out failed. Please try again.");
      setSigningOut(false);
    }
  }

  return (
    <nav aria-label="Customer dashboard pages" className="sticky top-0 z-30 border-b border-white/10 bg-[#0d1b32] text-white shadow-[0_8px_28px_rgba(9,22,44,.10)]">
      <div className="mx-auto flex max-w-[1480px] flex-nowrap items-center gap-2 px-4 py-3 md:px-6">
        <Link href="/dashboard" aria-label="CertVerify dashboard" className="group mr-1 inline-flex shrink-0 items-center gap-3 rounded-xl px-1 py-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#44d2be] to-[#13998e] text-[#092b39] shadow-[0_5px_18px_rgba(44,205,179,.2)]">
            <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 6"/><path d="M3 3h11M3 21h18"/></svg>
          </span>
          <span className="hidden flex-col leading-tight 2xl:flex">
            <span className="text-[16px] font-extrabold tracking-tight">CertVerify<span className="text-[#5be4d0]">.</span></span>
            <span className="text-[10px] font-medium tracking-[.13em] text-[#9ab7c7]">WORKSPACE</span>
          </span>
        </Link>

        <div className="min-w-0 flex-1 lg:hidden">
          <details ref={mobileMenu} className="group relative w-fit">
            <summary aria-label="Open navigation menu" className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-xs font-bold text-white [&::-webkit-details-marker]:hidden">
              <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
              Menu <Chevron/>
            </summary>
            <div className="absolute left-0 top-[calc(100%+7px)] z-50 max-h-[75vh] w-[min(82vw,300px)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
              {mobileGroups.map((group,index) => <div key={index}>
                {group.group && <p className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{group.group}</p>}
                {group.options.map(item => <Link key={item.href} href={item.href}
                  onClick={() => mobileMenu.current?.removeAttribute("open")}
                  className={"flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold " +
                    (active===item.href ? "bg-teal-50 text-teal-800" : "text-slate-700 hover:bg-slate-100")}>
                  <NavigationIcon kind={item.icon}/>{item.label}
                </Link>)}
              </div>)}
            </div>
          </details>
        </div>

        <div className="hidden min-w-0 flex-1 flex-nowrap items-center gap-0.5 py-0.5 lg:flex">
          {visible.map((item, i) => {
            if (isGroup(item)) {
              const highlighted = item.items.some(entry => entry.href === active);
              return <details ref={i === 2 ? firstMenu : secondMenu} key={item.label} className="group relative shrink-0">
                <summary aria-label={item.label} aria-current={highlighted ? "page" : undefined}
                  className={"flex cursor-pointer list-none items-center gap-2 rounded-xl px-2.5 py-2.5 text-[12px] font-semibold whitespace-nowrap marker:content-none [&::-webkit-details-marker]:hidden " +
                    (highlighted ? "bg-[#244759] text-[#86f3dd] ring-1 ring-[#3b6b75]" : "text-[#c1d3df] hover:bg-white/10 hover:text-white")}>
                  <NavigationIcon kind={item.icon}/>{item.label}<Chevron/>
                </summary>
                <div className="absolute left-0 top-[calc(100%+8px)] z-50 min-w-[235px] overflow-hidden rounded-2xl border border-[#c8d9e0] bg-white p-2 shadow-[0_20px_45px_rgba(9,26,42,.25)]">
                  {item.items.map(entry => <Link key={entry.href} href={entry.href}
                    aria-current={active === entry.href ? "page" : undefined}
                    onClick={() => { firstMenu.current?.removeAttribute("open"); secondMenu.current?.removeAttribute("open"); }}
                    className={"flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold " +
                      (active === entry.href ? "bg-[#e6f7f1] text-[#0b746a]" : "text-[#2d4f60] hover:bg-[#f1f8f9]")}>
                    <NavigationIcon kind={entry.icon}/>{entry.label}
                  </Link>)}
                </div>
              </details>;
            }
            const highlighted = active === item.href;
            return <Link key={item.href} href={item.href} aria-current={highlighted ? "page" : undefined}
              className={"inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-[12px] font-semibold whitespace-nowrap " +
                (highlighted ? "bg-[#244759] text-[#86f3dd] shadow-inner ring-1 ring-[#3b6b75]" : "text-[#c1d3df] hover:bg-white/10 hover:text-white")}>
              <NavigationIcon kind={item.icon}/>{item.label}
            </Link>;
          })}
        </div>

        {accounts.length > 1 && selected && onAccountChange && (
          <label className="ml-auto flex max-w-44 shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/[.07] px-2.5 py-1.5 text-xs font-medium text-[#9ad5cd]">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h10M7 12h10M7 16h7"/></svg>
            <span className="sr-only">Workspace</span>
            <select aria-label="Workspace" value={selected} onChange={e => onAccountChange(e.target.value)}
              className="min-w-0 max-w-[130px] bg-transparent py-1 text-sm font-semibold text-white outline-none [&_option]:text-slate-900">
              {accounts.map(account => <option value={account.id} key={account.id}>{account.account_name}</option>)}
            </select>
          </label>
        )}
        <div className="ml-auto flex shrink-0 items-center">
          <button type="button" onClick={() => void handleSignOut()} disabled={signingOut}
            aria-label="Sign Out" title="Sign Out"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/[.09] px-3 py-2.5 text-xs font-bold text-white transition hover:border-[#67e0cf]/60 hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#67e0cf] disabled:opacity-60">
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 17l5-5-5-5m5 5H3M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7"/>
            </svg>
            <span>{signingOut ? "Signing out…" : "Sign Out"}</span>
          </button>
        </div>
        {signOutError && <p role="alert" className="w-full text-right text-xs font-semibold text-rose-200">{signOutError}</p>}
      </div>
    </nav>
  );
}
