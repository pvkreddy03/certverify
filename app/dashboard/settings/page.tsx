"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";

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

export default function SettingsPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [membership, setMembership] =
    useState<Membership | null>(null);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [upgrading, setUpgrading] = useState(false);

  async function loadAccount() {
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
        "Could not load account: " +
          accountError.message
      );
      setLoading(false);
      return;
    }

    if (!accountData) {
      setErrorMessage(
        "Account information was not found."
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

    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadAccount());
  }, []);

  async function handleUpgrade() {
    const confirmed = window.confirm(
      "Upgrade this account to Multi-user?\n\n" +
        "Your existing certificates, certificate numbers, templates, " +
        "and account code will remain unchanged.\n\n" +
        "You will become the Main Admin and will be able to invite " +
        "sub-users to your organization."
    );

    if (!confirmed) {
      return;
    }

    setUpgrading(true);
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage(
        "Could not identify the logged-in user. Please sign out and sign in again."
      );
      setUpgrading(false);
      return;
    }

    const {
      data,
      error,
    } = await supabase.rpc(
      "cv_upgrade_account"
    );

    if (error) {
      setErrorMessage(
        "Could not upgrade account: " +
          error.message
      );
      setUpgrading(false);
      return;
    }

    if (data !== true) {
      setErrorMessage(
        "The account upgrade did not complete successfully."
      );
      setUpgrading(false);
      return;
    }

    await loadAccount();

    setUpgrading(false);

    alert(
      "Your account has been upgraded to Multi-user successfully."
    );
  }

  function formatAccountType(accountType: string) {
    if (accountType === "organization") {
      return "Multi-user Organization";
    }

    return "Individual";
  }

  function formatRole(role: string) {
    if (
      role === "owner" ||
      role === "admin"
    ) {
      return "Main Admin";
    }

    return "Sub-user";
  }

  return (
    <main className="cv-page min-h-screen px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl">

        {/* Header */}
        <div className="mb-8">
          <p className="cv-eyebrow mb-2">WORKSPACE PREFERENCES</p><h1 className="text-3xl font-extrabold tracking-tight text-[#1c314a]">
            Settings
          </h1>

          <p className="mt-2 text-slate-600">
            Manage your CertVerify account and
            organization settings.
          </p>
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-xl bg-white p-8 text-slate-600 shadow-sm">
            Loading account information...
          </div>
        )}

        {/* Error */}
        {!loading && errorMessage && (
          <div className="rounded-xl bg-red-50 p-5 text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Account */}
        {!loading &&
          !errorMessage &&
          account &&
          membership && (
            <div className="space-y-6">

              {/* Security settings remain available to every signed-in member.
                   Organization branding stays restricted to account managers. */}
              <section aria-label="Settings options" className="grid gap-4 sm:grid-cols-2">
                <Link href="/account/security" className="cv-card cv-card--interactive flex items-start gap-4 rounded-2xl p-6">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e5f6f0] text-[#0a847a]">
                    <svg aria-hidden="true" viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2 4 5v7c0 5.4 3.5 8.6 8 10 4.5-1.4 8-4.6 8-10V5Z"/><path d="m9 12 2 2 4-4"/></svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold text-[#1c394b]">Security Options</span>
                    <span className="mt-1 block text-sm leading-6 text-slate-600">Manage password, authenticator and account security settings.</span>
                    <span className="mt-4 block text-sm font-bold text-[#0a7770]">Manage security →</span>
                  </span>
                </Link>
                {(membership.role === "owner" || membership.role === "admin") && (
                  <Link href="/dashboard/branding" className="cv-card cv-card--interactive flex items-start gap-4 rounded-2xl p-6">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e7f1fa] text-[#2858a3]">
                      <svg aria-hidden="true" viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 2-9 5v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10"/></svg>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold text-[#1c394b]">Organization Branding</span>
                      <span className="mt-1 block text-sm leading-6 text-slate-600">Manage your organization&apos;s name, logo and issuer branding.</span>
                      <span className="mt-4 block text-sm font-bold text-[#0a7770]">Manage branding →</span>
                    </span>
                  </Link>
                )}
              </section>

              {/* Account Information */}
              <section className="rounded-xl bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold text-slate-900">
                  Account
                </h2>

                <div className="mt-6 grid gap-5 sm:grid-cols-2">

                  <div>
                    <p className="text-sm text-slate-500">
                      Account Name
                    </p>

                    <p className="mt-1 font-medium text-slate-900">
                      {account.account_name}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">
                      Account Code
                    </p>

                    <p className="mt-1 font-medium text-slate-900">
                      {account.account_code}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">
                      Account Type
                    </p>

                    <p className="mt-1 font-medium text-slate-900">
                      {formatAccountType(
                        account.account_type
                      )}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">
                      Your Role
                    </p>

                    <p className="mt-1 font-medium text-slate-900">
                      {formatRole(
                        membership.role
                      )}
                    </p>
                  </div>

                </div>
              </section>

              {/* Multi-user Upgrade */}
              {account.account_type ===
                "individual" &&
                (
                  membership.role === "owner" ||
                  membership.role === "admin"
                ) && (
                  <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">

                    <h2 className="text-xl font-semibold text-slate-900">
                      Multi-user
                    </h2>

                    <p className="mt-2 max-w-2xl text-slate-600">
                      Upgrade your account to work
                      with multiple users. You will
                      become the Main Admin and will
                      be able to manage your team and
                      view organization-wide
                      certificates.
                    </p>

                    <div className="mt-5 rounded-lg bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-800">
                        Your existing data is safe
                      </p>

                      <p className="mt-1 text-sm text-slate-600">
                        Existing certificates,
                        certificate numbers,
                        templates, and your account
                        code will remain unchanged
                        after the upgrade.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleUpgrade}
                      disabled={upgrading}
                      className="mt-6 rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {upgrading
                        ? "Upgrading..."
                        : "Upgrade to Multi-user"}
                    </button>

                  </section>
                )}

              {/* Organization Status */}
              {account.account_type ===
                "organization" && (
                <section className="rounded-xl bg-white p-6 shadow-sm">

                  <h2 className="text-xl font-semibold text-slate-900">
                    Organization
                  </h2>

                  <p className="mt-2 text-slate-600">
                    Your account is enabled for
                    multi-user access.
                  </p>

                  <div className="mt-5 rounded-lg bg-green-50 p-4">
                    <p className="font-medium text-green-800">
                      Multi-user enabled
                    </p>

                    <p className="mt-1 text-sm text-green-700">
                      {formatRole(
                        membership.role
                      )}
                    </p>
                  </div>

                </section>
              )}

            </div>
          )}

      </div>
    </main>
  );
}