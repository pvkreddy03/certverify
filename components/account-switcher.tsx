"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { chooseAccount, selectAccount, selectedAccountId, type AccountMembership } from "@/lib/accounts/context";

export function AccountWorkspace({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<AccountMembership[]>([]);
  const [selected, setSelected] = useState<AccountMembership | null>(null);
  const [accessStates,setAccessStates]=useState<Record<string,string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [{ data,error:rpcError },states]=await Promise.all([supabase.rpc("cv_list_accounts"),supabase.rpc("cv_customer_account_states")]);
        if (states.error) throw new Error("Account access could not be checked. Please retry later.");
        if (rpcError) throw new Error("Account access could not be loaded. Please sign in again or contact support.");
        if (cancelled) return;
        const memberships = (data ?? []) as AccountMembership[];
        const current = chooseAccount(memberships, selectedAccountId());
        if (current) selectAccount(current.id);
        setAccessStates(Object.fromEntries((states.data ?? []).map((state:{ account_id:string;status:string })=>[state.account_id,state.status])));
        setAccounts(memberships);
        setSelected(current);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load accounts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <main className="p-8 text-slate-600">Loading your accounts…</main>;
  if (error || !selected) return <main className="p-8"><p role="alert">{error || "You have no active account membership. Ask your organization owner for an invitation."}</p><a className="text-blue-700" href="/login">Sign in</a></main>;

  return <>
    <div className="flex flex-wrap items-center gap-3 border-b bg-white px-6 py-3">
      <label htmlFor="account-switcher" className="text-sm font-medium">Current account</label>
      <select id="account-switcher" value={selected.id} className="rounded border px-3 py-2" onChange={(event) => {
        const next = accounts.find((account) => account.id === event.target.value);
        if (!next) return;
        selectAccount(next.id);
        // A full navigation clears forms, tenant caches and in-flight UI updates.
        window.location.assign("/dashboard");
      }}>
        {accounts.map((account) => <option key={account.id} value={account.id}>{account.account_name} ({account.account_type})</option>)}
      </select>
      <span className="text-sm capitalize text-slate-500">{selected.role}</span>
      <Link href="/dashboard/branding" className="text-sm text-blue-700">Branding</Link>
    </div>
    {accessStates[selected.id]==="active" ? children : <main className="p-8"><h1 className="text-2xl font-semibold">Account access {accessStates[selected.id] ?? "unavailable"}</h1><p className="mt-3">Customer operations are unavailable for this account. Contact CertVerify support, or switch to another active account above. Issued certificates remain publicly verifiable.</p></main>}
  </>;
}
