"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";

type Account = {
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
        .select("account_type")
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

    setAccount(accountData);

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

              <Link href="/dashboard/profile" className="cv-card cv-card--interactive flex items-start gap-4 rounded-2xl p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e3f8f0] text-[#0c7b71]">
                  <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg>
                </span>
                <span><span className="block text-lg font-bold text-[#1c394b]">My Profile</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">Update contact details, profession and your optional profile photo.</span>
                  <span className="mt-4 block text-sm font-bold text-[#0a7770]">Edit profile →</span>
                </span>
              </Link>
              {membership.role === "owner" && <Link href="/dashboard/subscription" className="cv-card cv-card--interactive flex items-start gap-4 rounded-2xl p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e7f2fb] text-[#2454a0]">
                  <svg aria-hidden="true" viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M7 15h4"/>
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-[#1c394b]">Subscriptions</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">Manage plans, licensed seats, billing and your payment history.</span>
                  <span className="mt-4 block text-sm font-bold text-[#0a7770]">Manage subscriptions →</span>
                </span>
              </Link>}
              {/* Security settings remain available to every signed-in member.
                   Subscriptions are owner-only; branding is manager-only. */}
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

              <Link href="/dashboard/my-cover-letters" className="cv-card cv-card--interactive flex items-start gap-4 rounded-2xl p-6">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e5f6f0] text-[#087a6f]">
                  <svg aria-hidden="true" width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7M9 16h7"/>
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold text-[#1c394b]">Letterhead &amp; QR Placement</span>
                  <span className="mt-1 block text-sm leading-6 text-slate-600">Set or change the default letterhead once for every certificate. Specialized cover formats are optional.</span>
                  <span className="mt-4 block text-sm font-bold text-[#0a7770]">Manage letterhead →</span>
                </span>
              </Link>

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


            </div>
          )}

      </div>
    </main>
  );
}