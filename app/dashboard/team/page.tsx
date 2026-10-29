"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useEmailCooldown } from "@/lib/auth/email-cooldown";
import { isValidEmail, INVALID_EMAIL_MESSAGE } from "@/lib/auth/email-validation";
import { MemberActions } from "@/components/member-actions";
import { accountHeaders, requireSelectedAccountId } from "@/lib/accounts/context";

type TeamMember = {
  id: string;
  user_id: string;
  email: string;
  role: string;
  status: string;
  joined_at: string;
  can_manage_templates?: boolean;
  can_access_reference_map?: boolean;
};

type Account = {
  id: string;
  account_name: string;
  account_code: string;
  account_type: string;
};

type Membership = {
  role: string;
  status: string;
};

type Invitation = {
  id: string;
  invited_email: string;
  invited_role: string;
  status: string;
  display_status: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);
  const [invitationListError, setInvitationListError] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [membership, setMembership] =
    useState<Membership | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [showUpgradeModal, setShowUpgradeModal] =
    useState(false);

  const [showInviteModal, setShowInviteModal] =
    useState(false);

  const [upgrading, setUpgrading] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const inviteCooldown = useEmailCooldown("team-invitation");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteError, setInviteError] = useState("");

  async function loadTeam() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    const { data: membershipData, error: membershipError } =
      await supabase
        .from("account_members")
        .select("account_id, role, status")
        .eq("user_id", user.id)
        .eq("status", "active")
        .eq("account_id", requireSelectedAccountId())
        .maybeSingle();

    if (membershipError) {
      setErrorMessage(
        "Could not load account membership: " +
          membershipError.message
      );
      setLoading(false);
      return;
    }

    if (!membershipData) {
      setErrorMessage("No active account was found.");
      setLoading(false);
      return;
    }

    const { data: accountData, error: accountError } =
      await supabase
        .from("accounts")
        .select(
          "id, account_name, account_code, account_type"
        )
        .eq("id", membershipData.account_id)
        .maybeSingle();

    if (accountError) {
      setErrorMessage(
        "Could not load account: " + accountError.message
      );
      setLoading(false);
      return;
    }

    if (!accountData) {
      setErrorMessage("Account information was not found.");
      setLoading(false);
      return;
    }

    // A tenant-scoped RPC resolves user IDs to verified auth emails.
    // It exposes only this account's users (members see only themselves).
    const { data: memberData, error: memberError } =
      await supabase.rpc("cv_team_member_directory");

    if (memberError) {
      setErrorMessage(
        "Could not load team members: " +
          memberError.message
      );
      setLoading(false);
      return;
    }

    const { data:branding }=await supabase.rpc("cv_current_branding");
    setAccount({ ...accountData,account_name:branding?.company_name ?? accountData.account_name });

    setMembership({
      role: membershipData.role,
      status: membershipData.status,
    });

    // Read the per-member permission separately from the existing directory RPC.
    // Organization RLS limits these records to the selected account.
    const { data: permissionRows, error: permissionError } = await supabase
      .from("account_members")
      .select("id, can_manage_templates, can_access_reference_map")
      .eq("account_id", membershipData.account_id);
    if (permissionError) {
      setErrorMessage("Could not load member permissions: " + permissionError.message);
      setLoading(false);
      return;
    }
    const visiblePermissions = Array.isArray(permissionRows) ? permissionRows : (permissionRows ? [permissionRows] : []);
    const permissionById = new Map(visiblePermissions.map(row => [row.id, row]));
    setMembers(((memberData ?? []) as TeamMember[]).map(member => ({
      ...member,
      can_manage_templates: permissionById.get(member.id)?.can_manage_templates === true,
      can_access_reference_map: permissionById.get(member.id)?.can_access_reference_map === true,
    })));
    setLoading(false);
    // This function declaration is hoisted; load invitations after the team fetch.
    // eslint-disable-next-line react-hooks/immutability
    await loadInvitations();
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTeam());
  }, []);

  async function loadInvitations() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setInvitations([]);
      return;
    }

    const response = await fetch("/api/team/invitations", {
      method: "GET",
      headers: accountHeaders({ Authorization: `Bearer ${session.access_token}` }),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      setInvitationListError(result?.error || "Could not load invitations.");
      return;
    }

    setInvitationListError("");
    setInvitations(result.invitations ?? []);
  }

  async function handleInvitationAction(invitationId: string, action: "resend" | "revoke") {
    if (action === "resend" && inviteCooldown.disabled) return;
    setInvitationActionId(invitationId);
    setInvitationListError("");
    setInviteError("");
    setInviteMessage("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setInvitationListError("Your session expired. Please sign in again.");
        return;
      }

      if (action === "resend") inviteCooldown.start();
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        method: "PATCH",
        headers: accountHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        }),
        body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setInvitationListError(result?.error || "The invitation action failed.");
        return;
      }

      setInviteMessage(result?.message || (action === "resend" ? "Invitation resent." : "Invitation revoked."));
      await loadInvitations();
    } catch (error) {
      console.error("Invitation action error:", error);
      setInvitationListError("An unexpected error occurred while updating the invitation.");
    } finally {
      setInvitationActionId(null);
    }
  }

  function isMainAdmin() {
    return (
      membership?.role === "owner" ||
      membership?.role === "admin"
    );
  }

  function handleAddUserClick() {
    setInviteError("");
    setInviteMessage("");

    if (!account) {
      return;
    }

    if (account.account_type === "individual") {
      setShowUpgradeModal(true);
      return;
    }

    if (account.account_type === "organization") {
      if (!isMainAdmin()) {
        return;
      }

      setInviteEmail("");
      setShowInviteModal(true);
    }
  }

  async function handleUpgrade() {
    setUpgrading(true);
    setInviteError("");
    setErrorMessage("");

    const { data, error } = await supabase.rpc(
      "cv_upgrade_account"
    );

    if (error) {
      console.error("Account upgrade error:", error);

      setInviteError(
        "Could not upgrade account: " + error.message
      );

      setUpgrading(false);
      return;
    }

    if (data !== true) {
      setInviteError(
        "The account upgrade did not complete successfully."
      );

      setUpgrading(false);
      return;
    }

    setShowUpgradeModal(false);
    setUpgrading(false);

    await loadTeam();

    alert(
      "Your account has been upgraded to Multi-user successfully."
    );
  }

  async function handleSendInvitation(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setInviteError("");
    setInviteMessage("");

    const email = inviteEmail.trim().toLowerCase();

    if (!isValidEmail(email)) {
      setInviteError(INVALID_EMAIL_MESSAGE);
      return;
    }

    if (inviteCooldown.disabled) { setInviteError(`Please retry in ${inviteCooldown.remaining}s.`); return; }
    setSendingInvite(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setInviteError(
          "Your login session has expired. Please sign in again."
        );
        setSendingInvite(false);
        return;
      }

      inviteCooldown.start();
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: accountHeaders({
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        }),
        body: JSON.stringify({
          email,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setInviteError(
          result?.error ||
            "The invitation could not be sent."
        );

        setSendingInvite(false);
        return;
      }

      setInviteMessage(
        result?.message ||
          `Invitation sent to ${email}.`
      );

      setInviteEmail("");
      setSendingInvite(false);

      await loadTeam();
    } catch (error) {
      console.error("Invitation request error:", error);

      setInviteError(
        "An unexpected error occurred while sending the invitation."
      );

      setSendingInvite(false);
    }
  }

  function closeUpgradeModal() {
    if (upgrading) {
      return;
    }

    setShowUpgradeModal(false);
    setInviteError("");
  }

  function closeInviteModal() {
    if (sendingInvite) {
      return;
    }

    setShowInviteModal(false);
    setInviteEmail("");
    setInviteMessage("");
    setInviteError("");
  }

  function formatRole(role: string) {
    if (role === "owner" || role === "admin") {
      return "Main Admin";
    }

    return "Sub-user";
  }

  function formatStatus(status: string) {
    if (status === "active") {
      return "Active";
    }

    if (status === "pending") {
      return "Pending";
    }

    if (status === "inactive") {
      return "Inactive";
    }

    return status;
  }

  return (
    <main className="cv-page min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="cv-eyebrow mb-2">ORGANIZATION CONTROL</p><h1 className="text-3xl font-extrabold tracking-tight text-[#1c314a]">
              Team
            </h1>

            <p className="mt-2 text-slate-600">
              Manage users who have access to your CertVerify organization.
            </p>
          </div>

          {account && (
            <button
              type="button"
              onClick={handleAddUserClick}
              disabled={
                account.account_type === "organization" &&
                !isMainAdmin()
              }
              className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              + Add User
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-xl bg-white p-8 text-slate-600 shadow-sm">
            Loading team members...
          </div>
        )}

        {/* Error */}
        {!loading && errorMessage && (
          <div className="rounded-xl bg-red-50 p-5 text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Team */}
        {!loading && !errorMessage && (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

            <div className="border-b border-slate-200 px-6 py-4">
              <h2 className="font-semibold text-slate-900">
                Team Members
              </h2>

              <p className="mt-1 text-sm text-slate-500">The account owner controls each sub-user&apos;s access to the private Reference Map.</p>
              <p className="mt-1 text-sm text-slate-500">
                {members.length} member
                {members.length === 1 ? "" : "s"}
              </p>
            </div>

            {members.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                No team members found.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">

                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
                  >

                    <div>
                      <p className="font-medium text-slate-900">
                        {member.email}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {member.role === "owner" ? "Organization owner" : member.role === "admin" ? "Organization administrator" : "Team member"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">

                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {formatRole(member.role)}
                      </span>

                      <span
                        className={
                          member.status === "active"
                            ? "rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                            : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                        }
                      >
                        {formatStatus(member.status)}
                      </span>
                      <MemberActions memberId={member.id} role={member.role} actorRole={membership?.role} active={member.status === "active"} canManageTemplates={member.can_manage_templates === true} canAccessReferenceMap={member.can_access_reference_map === true} onChanged={loadTeam} />

                    </div>

                  </div>
                ))}

              </div>
            )}

          </section>
        )}

      </div>

      {/* Invitations */}
      {!loading && !errorMessage && account?.account_type === "organization" && isMainAdmin() && (
        <section className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="font-semibold text-slate-900">Invitations</h2>
            <p className="mt-1 text-sm text-slate-500">
              Resend links for people who have not joined yet, or revoke invitations that should no longer work.
            </p>
          </div>

          {invitationListError && (
            <div className="m-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">{invitationListError}</div>
          )}
          {inviteMessage && (
            <div className="m-5 rounded-lg bg-green-50 p-4 text-sm text-green-700">{inviteMessage}</div>
          )}

          {invitations.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No invitations found.</p>
          ) : (
            <div className="divide-y divide-slate-200">
              {invitations.map((invitation) => {
                const canResend = invitation.display_status !== "accepted";
                const canRevoke = invitation.display_status === "pending";
                return (
                  <div key={invitation.id} className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-all font-medium text-slate-900">{invitation.invited_email}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Expires: {new Date(invitation.expires_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={invitation.display_status === "accepted"
                        ? "rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                        : invitation.display_status === "pending"
                          ? "rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                          : "rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"}>
                        {invitation.display_status.charAt(0).toUpperCase() + invitation.display_status.slice(1)}
                      </span>
                      {canResend && (
                        <button
                          type="button"
                          onClick={() => handleInvitationAction(invitation.id, "resend")}
                          disabled={invitationActionId !== null || inviteCooldown.disabled}
                          className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {invitationActionId === invitation.id ? "Working..." : inviteCooldown.disabled ? `Resend in ${inviteCooldown.remaining}s` : "Resend"}
                        </button>
                      )}
                      {canRevoke && (
                        <button
                          type="button"
                          onClick={() => handleInvitationAction(invitation.id, "revoke")}
                          disabled={invitationActionId !== null}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">

            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
              C
            </div>

            <h2 className="mt-5 text-center text-xl font-bold text-slate-900">
              Multi-user feature
            </h2>

            <p className="mt-3 text-center text-sm leading-6 text-slate-600">
              Your current CertVerify account is an Individual
              account. To add team members, you need to upgrade
              to a Multi-user Organization.
            </p>

            <div className="mt-5 rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium text-slate-800">
                Your existing data is safe
              </p>

              <p className="mt-1 text-sm leading-5 text-slate-600">
                Your certificates, certificate numbers,
                templates, account code, and existing records
                will remain unchanged.
              </p>
            </div>

            {inviteError && (
              <div className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-700">
                {inviteError}
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

              <button
                type="button"
                onClick={closeUpgradeModal}
                disabled={upgrading}
                className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleUpgrade}
                disabled={upgrading}
                className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {upgrading
                  ? "Upgrading..."
                  : "Upgrade to Multi-user"}
              </button>

            </div>

          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-7 shadow-xl">

            <h2 className="text-xl font-bold text-slate-900">
              Add User
            </h2>

            <p className="mt-2 text-sm leading-6 text-slate-600">
              Enter the email address of the person you want
              to invite to your CertVerify organization.
            </p>

            <form
              onSubmit={handleSendInvitation}
              className="mt-6 space-y-5"
            >

              <div>
                <label
                  htmlFor="inviteEmail"
                  className="block text-sm font-medium text-slate-700"
                >
                  Email address
                </label>

                <input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) =>
                    setInviteEmail(event.target.value)
                  }
                  placeholder="user@example.com"
                  required
                  disabled={sendingInvite}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                />
              </div>

              {inviteError && (
                <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                  {inviteError}
                </div>
              )}

              {inviteMessage && (
                <div className="rounded-lg bg-green-50 p-4 text-sm text-green-700">
                  {inviteMessage}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">

                <button
                  type="button"
                  onClick={closeInviteModal}
                  disabled={sendingInvite}
                  className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Close
                </button>

                <button
                  type="submit"
                  disabled={sendingInvite || inviteCooldown.disabled}
                  className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendingInvite
                    ? "Sending invitation..."
                    : inviteCooldown.disabled ? `Send in ${inviteCooldown.remaining}s` : "Send Invitation"}
                </button>

              </div>

            </form>

          </div>
        </div>
      )}

    </main>
  );
}