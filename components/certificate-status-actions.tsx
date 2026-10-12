"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { canManageAccount, selectedAccountId, type AccountMembership } from "@/lib/accounts/context";
import { validateStatusChange, type CertificateStatus } from "@/lib/certificates/status";

export function CertificateStatusActions({ certificateId, status, onChanged }: {
  certificateId: string; status: string; onChanged: () => Promise<void>;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [target, setTarget] = useState<CertificateStatus | null>(null);
  const [reason, setReason] = useState("");
  const [publicReason, setPublicReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("cv_list_accounts").then(({ data, error }) => {
      const account = (data as AccountMembership[] | null)?.find((item) => item.id === selectedAccountId());
      if (!cancelled) setAuthorized(!error && !!account && canManageAccount(account.role));
    });
    return () => { cancelled = true; };
  }, []);
  if (status === "Revoked") return <p className="text-sm text-red-800">Revocation is permanent. Issue a new linked certificate if a replacement is needed.</p>;
  if (!authorized) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    const validation = validateStatusChange(target, reason, publicReason);
    if (validation) { setError(validation); return; }
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("cv_change_certificate_status", {
        p_certificate_id: certificateId, p_status: target, p_reason: reason.trim() || null,
        p_public_reason: target === "Revoked" ? publicReason.trim() || null : null,
      });
      if (rpcError) throw new Error("The status could not be changed. Check your current permissions and refresh the certificate before retrying.");
      await onChanged();
      setTarget(null);
      setReason("");
      setPublicReason("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not change the status."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-2xl bg-white p-8 shadow-sm">
    <h2 className="text-xl font-semibold">Manage certificate status</h2>
    {!target ? <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => setTarget(status === "Active" ? "Inactive" : "Active")} className="rounded border px-4 py-2">{status === "Active" ? "Mark inactive" : "Restore active"}</button>
      <button type="button" onClick={() => setTarget("Revoked")} className="rounded bg-red-700 px-4 py-2 text-white">Revoke certificate</button>
    </div> : <form onSubmit={submit} className="space-y-4">
      <p>{target === "Revoked" ? "This permanently withdraws the certificate. Its record and QR verification page will remain available." : `Change status to ${target}.`}</p>
      <label className="block">{target === "Revoked" ? "Revocation reason (internal)" : "Internal note (optional)"}
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} required={target === "Revoked"} maxLength={2000} disabled={busy} className="mt-2 block w-full rounded border p-3" />
      </label>
      {target === "Revoked" && <label className="block">Public explanation (optional)
        <textarea value={publicReason} onChange={(event) => setPublicReason(event.target.value)} maxLength={500} disabled={busy} className="mt-2 block w-full rounded border p-3" />
        <span className="text-sm text-slate-600">Only this explanation appears on public verification. Keep confidential details in the internal reason.</span>
      </label>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="flex gap-3"><button type="submit" disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-white">{busy ? "Saving…" : target === "Revoked" ? "Confirm permanent revocation" : "Confirm status change"}</button>
        <button type="button" disabled={busy} onClick={() => { setTarget(null); setError(""); }} className="rounded border px-4 py-2">Cancel</button></div>
    </form>}
  </section>;
}
