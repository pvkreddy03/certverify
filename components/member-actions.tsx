"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function MemberActions({ memberId, role, actorRole, active, onChanged }: {
  memberId: string; role: string; actorRole?: string; active: boolean; onChanged: () => Promise<void>;
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
      const { error: rpcError } = await supabase.rpc("cv_manage_member", { p_member_id: memberId, p_role: nextRole, p_remove: remove });
      if (rpcError) throw new Error("This member could not be updated. Check your current permissions and retry.");
      await onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update this member."); }
    finally { setBusy(false); }
  }
  return <div className="flex flex-wrap gap-2">
    {actorRole === "owner" && <select aria-label="Member role" value={role} disabled={busy} className="rounded border px-2 py-1" onChange={(event) => { void change(event.target.value, false); }}><option value="member">Member</option><option value="admin">Admin</option></select>}
    <button type="button" disabled={busy} className="text-red-700" onClick={() => { void change(null, true); }}>Remove access</button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
