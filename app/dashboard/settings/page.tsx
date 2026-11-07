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
  const [internalWorkspace, setInternalWorkspace] = useState(false);

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

    const { data: internalAccess } = await supabase.rpc("cv_my_internal_workspace");
    setInternalWorkspace(internalAccess === true);
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
    <main className="cv-page">
      <div className="cv-shell max-w-4xl space-y-6">
        <header>
          <p className="text-sm font-bold text-teal-800">YOUR ACCOUNT</p>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Settings</h1>
          <p className="mt-2 text-base text-slate-600">Select what you want to change.</p>
        </header>
        {loading && <p role="status" className="cv-panel p-6 text-base">Loading account settings…</p>}
        {!loading && errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">{errorMessage}</p>}
        {!loading && !errorMessage && account && membership && <>
          {membership.role==="owner" && internalWorkspace &&
            <p role="status" className="rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 text-base font-semibold text-teal-900">
              Super Admin — Internal access active. No subscription or branding approval needed.
            </p>}
          <section aria-label="Settings options" className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <Link href="/dashboard/profile" className="flex min-h-20 items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
              <span><span className="block text-lg font-bold text-slate-900">My Profile</span>
                <span className="mt-1 block text-sm text-slate-600">Name, contact details and profile photo</span></span>
              <span aria-hidden="true" className="text-lg text-teal-700">→</span>
            </Link>
            {membership.role==="owner"&&!internalWorkspace&&<Link href="/dashboard/subscription"
              className="flex min-h-20 items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
              <span><span className="block text-lg font-bold text-slate-900">Subscriptions</span>
                <span className="mt-1 block text-sm text-slate-600">Plan, fees and invoices</span></span>
              <span aria-hidden="true" className="text-lg text-teal-700">→</span>
            </Link>}
            <Link href="/dashboard/cover-letters"
              className="flex min-h-20 items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
              <span><span className="block text-lg font-bold text-slate-900">Letterhead &amp; QR Placement</span>
                <span className="mt-1 block text-sm text-slate-600">Upload letterhead or change where the QR appears</span></span>
              <span aria-hidden="true" className="text-lg text-teal-700">→</span>
            </Link>
            {(membership.role==="owner"||membership.role==="admin")&&<Link href="/dashboard/branding"
              className="flex min-h-20 items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
              <span><span className="block text-lg font-bold text-slate-900">Organization Branding</span>
                <span className="mt-1 block text-sm text-slate-600">Organization name and logo</span></span>
              <span aria-hidden="true" className="text-lg text-teal-700">→</span>
            </Link>}
            <Link href="/account/security"
              className="flex min-h-20 items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
              <span><span className="block text-lg font-bold text-slate-900">Security Options</span>
                <span className="mt-1 block text-sm text-slate-600">Password and sign-in protection</span></span>
              <span aria-hidden="true" className="text-lg text-teal-700">→</span>
            </Link>
          </section>
          {account.account_type==="individual" && (membership.role==="owner"||membership.role==="admin") &&
            <details className="rounded-xl border border-slate-200 bg-white p-5">
              <summary className="cursor-pointer text-base font-bold text-slate-700">
                Optional · Upgrade to Multi-user
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Invite team members to help you with valuation records. Your existing certificates,
                templates and account code remain unchanged.
              </p>
              <button type="button" onClick={handleUpgrade} disabled={upgrading}
                className="cv-primary mt-4 disabled:opacity-50">
                {upgrading?"Upgrading…":"Upgrade to Multi-user"}
              </button>
            </details>}
        </>}
      </div>
    </main>
  );
}
