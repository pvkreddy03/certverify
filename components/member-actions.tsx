"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function MemberActions({
  memberId, role, actorRole, active, canManageTemplates = false, canAccessReferenceMap = false, onChanged,
}: {
  memberId: string;
  role: string;
  actorRole?: string;
  active: boolean;
  canManageTemplates?: boolean;
  canAccessReferenceMap?: boolean;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allowed = active && role !== "owner" && (actorRole === "owner" || (actorRole === "admin" && role === "member"));
  if (!allowed) return null;

  async function change(nextRole: string | null, remove: boolean) {
    if (remove && !window.confirm("Remove this member's organization access? Historical activity will be retained.")) return;
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("cv_manage_member", {
        p_member_id: memberId, p_role: nextRole, p_remove: remove,
      });
      if (rpcError) throw new Error("This member could not be updated. Check your current permissions and retry.");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update this member.");
    } finally {
      setBusy(false);
    }
  }

  async function setTemplateAccess(allowed: boolean) {
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("cv_set_member_template_permission", {
        p_member_id: memberId, p_allowed: allowed,
      });
      if (rpcError) throw new Error("Template permission could not be updated. Only organization administrators may change this.");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update template access.");
    } finally {
      setBusy(false);
    }
  }

  async function setReferenceMapAccess(allowed: boolean) {
    setBusy(true); setError("");
    try {
      const { error: rpcError } = await supabase.rpc("cv_set_member_map_permission", {
        p_member_id: memberId, p_allowed: allowed,
      });
      if (rpcError) throw new Error("Only the organization owner can change Reference Map permissions.");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update Reference Map permission.");
    } finally { setBusy(false); }
  }

  return <div className="flex flex-wrap items-center gap-3">
    {actorRole === "owner" && <select aria-label="Member role" value={role} disabled={busy} className="rounded border px-2 py-1" onChange={event => { void change(event.target.value, false); }}>
      <option value="member">Member</option><option value="admin">Admin</option>
    </select>}
    {role === "member" && <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-900">
      <input type="checkbox" checked={canManageTemplates} disabled={busy} onChange={event => void setTemplateAccess(event.target.checked)} aria-label="Allow this member to create and edit templates" />
      Allow template creation
    </label>}
    {role === "member" && actorRole === "owner" && <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">
      <input type="checkbox" checked={canAccessReferenceMap} disabled={busy}
        onChange={event => void setReferenceMapAccess(event.target.checked)}
        aria-label="Allow this member to access Reference Map" />
      Reference Map access
    </label>}
    <button type="button" disabled={busy} className="text-red-700" onClick={() => { void change(null, true); }}>Remove access</button>
    {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
  </div>;
}
