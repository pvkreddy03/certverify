"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { chooseAccount, visibleWorkspaces, selectAccount, selectedAccountId, type AccountMembership } from "@/lib/accounts/context";

type BillingStatus = { account_id?: string; entitled: boolean; status: string };

export function AccountWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [accounts, setAccounts] = useState<AccountMembership[]>([]);
  const [selected, setSelected] = useState<AccountMembership | null>(null);
  const [accessStates, setAccessStates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [{ data, error: rpcError }, states] = await Promise.all([
          supabase.rpc("cv_list_accounts"), supabase.rpc("cv_customer_account_states"),
        ]);
        if (states.error) throw new Error("Account access could not be checked. Please retry later.");
        if (rpcError) throw new Error("Account access could not be loaded. Please sign in again or contact support.");
        if (cancelled) return;

        const memberships = (data ?? []) as AccountMembership[];
        const workspaces = visibleWorkspaces(memberships);
        const current = chooseAccount(workspaces, selectedAccountId());
        // The selected account is only a routing preference. Server-side RLS
        // checks its real membership and organization billing on every action.
        if (current) selectAccount(current.id);
        setAccounts(workspaces);
        setAccessStates(Object.fromEntries((states.data ?? []).map(
          (state: { account_id: string; status: string }) => [state.account_id, state.status],
        )));
        setSelected(current);
        if (current) {
          const response = await supabase.rpc("cv_subscription_status");
          if (!cancelled) setBilling(
            response.error || !response.data || response.data.account_id !== current.id
              ? { entitled: false, status: "unavailable", account_id: current.id }
              : response.data as BillingStatus,
          );
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load accounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [pathname]);

  if (loading) return <main className="p-8 text-slate-600">Loading your workspace…</main>;
  if (error || !selected) return <main className="p-8">
    <p role="alert">{error || "You have no active account membership. Ask your organization owner for an invitation."}</p>
    <a className="text-blue-700" href="/login">Sign in</a>
  </main>;

  const owner = selected.role === "owner";
  const manager = owner || selected.role === "admin";
  const staff = !manager;
  const canManageBilling = owner;
  const accessStatus = accessStates[selected.id] ?? "unavailable";
  const hasEntitlement = billing?.entitled === true;
  const existingRecords = pathname === "/dashboard"
    || /^\/dashboard\/certificates\/(list|[0-9a-f-]{36})$/.test(pathname);

  function switchWorkspace(id: string) {
    if (!accounts.some((account) => account.id === id)) return;
    selectAccount(id);
    // Reload all account-scoped data, certificates and billing state.
    window.location.assign("/dashboard");
  }

  let content: ReactNode = children;
  if (staff && (pathname === "/dashboard/team" || pathname === "/dashboard/subscription" || pathname === "/dashboard/payment" || pathname === "/dashboard/branding")) {
    content = <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Managed by your organization</h1>
      <p className="mt-3 text-slate-600">Team membership, billing and branding are managed by the organization owner. You can issue certificates under your organization&apos;s subscription without purchasing a separate plan.</p>
      <Link href="/dashboard" className="mt-4 inline-block font-semibold text-blue-700">Return to dashboard</Link>
    </main>;
  } else if (!staff && !owner && (pathname === "/dashboard/subscription" || pathname === "/dashboard/payment")) {
    content = <main className="p-8"><h1 className="text-2xl font-semibold">Owner access required</h1><p className="mt-3">Only the organization owner can manage payment and subscription settings.</p><Link className="mt-3 block text-blue-700" href="/dashboard">Return to dashboard</Link></main>;
  } else if (accessStatus !== "active") {
    content = <main className="p-8"><h1 className="text-2xl font-semibold">Account access {accessStatus}</h1><p className="mt-3">Customer operations are unavailable for this account. Contact CertVerify support, or select another workspace if available. Issued certificates remain publicly verifiable.</p></main>;
  } else if (!hasEntitlement && !existingRecords && pathname !== "/dashboard/subscription" && pathname !== "/dashboard/payment") {
    content = <main className="p-8">
      <h1 className="text-2xl font-semibold">{canManageBilling ? "Subscription required" : "Organization subscription unavailable"}</h1>
      <p className="mt-3 text-slate-600">{canManageBilling
        ? "Renew or activate a subscription to use this feature. Existing certificates and public verification remain available."
        : "Your organization does not currently have certificate-generation access. Contact your organization owner; do not purchase a personal subscription."}</p>
      {canManageBilling && <Link className="mt-3 block text-blue-700" href="/dashboard/subscription">View subscription and renewal options</Link>}
      <Link href="/dashboard/certificates/list" className="mt-3 block text-blue-700">View issued certificates</Link>
    </main>;
  }

  return <>
    <DashboardNavigation
      role={selected.role}
      accounts={accounts}
      selectedAccountId={selected.id}
      onAccountChange={switchWorkspace}
    />
    {billing && !hasEntitlement && accessStatus === "active" && (
      <p className="border-b bg-amber-50 px-6 py-3 text-sm text-amber-950">
        {canManageBilling
          ? <>Subscription {billing.status}. Certificate generation is restricted. <Link href="/dashboard/subscription" className="font-semibold text-blue-800 underline">Manage subscription or renewal</Link></>
          : "Your organization subscription needs attention. Ask your organization owner to resolve it; you do not need an individual subscription."}
      </p>
    )}
    {content}
  </>;
}
