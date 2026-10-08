"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [email, setEmail] = useState("");

  const [certificateCount, setCertificateCount] =
    useState<number | null>(null);

  const [templateCount, setTemplateCount] =
    useState<number | null>(null);

  const [verificationCount, setVerificationCount] =
    useState<number | null>(null);

  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoadingStats(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoadingStats(false);
      return;
    }

    setEmail(user.email ?? "");

    /*
     * Certificates:
     *
     * We intentionally do not add a user_id filter here.
     *
     * RLS determines what the current user is allowed to see:
     * - Individual / Sub-user -> own certificates
     * - Organization Admin -> organization certificates
     */
    const {
      count: certificates,
      error: certificateError,
    } = await supabase
      .from("certificates")
      .select("id", {
        count: "exact",
        head: true,
      });

    if (certificateError) {
      console.error(
        "Could not load certificate count:",
        certificateError.message
      );
    } else {
      setCertificateCount(certificates ?? 0);
    }

    /*
     * Templates:
     *
     * RLS determines which templates belong to the current
     * account/user.
     */
    const {
      count: templates,
      error: templateError,
    } = await supabase
      .from("certificate_templates")
      .select("id", {
        count: "exact",
        head: true,
      });

    if (templateError) {
      console.error(
        "Could not load template count:",
        templateError.message
      );
    } else {
      setTemplateCount(templates ?? 0);
    }

    /*
     * Verification records:
     *
     * RLS allows the user to see verification records only
     * for certificates they are permitted to access.
     */
    const {
      count: verifications,
      error: verificationError,
    } = await supabase
      .from("certificate_verifications")
      .select("id", {
        count: "exact",
        head: true,
      });

    if (verificationError) {
      console.error(
        "Could not load verification count:",
        verificationError.message
      );
    } else {
      setVerificationCount(verifications ?? 0);
    }

    setLoadingStats(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function displayCount(value: number | null) {
    if (loadingStats || value === null) {
      return "—";
    }

    return value.toLocaleString("en-IN");
  }

  return (
    <main className="min-h-screen bg-slate-50">

      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

          <div>
            <h1 className="text-xl font-bold text-slate-900">
              CertVerify
            </h1>

            <p className="text-xs text-slate-500">
              Certificate Verification Platform
            </p>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-600 md:block">
              {email}
            </span>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>

        </div>
      </header>

      <div className="mx-auto flex max-w-7xl">

        {/* Sidebar */}
        <aside className="hidden min-h-[calc(100vh-73px)] w-64 border-r border-slate-200 bg-white p-5 md:block">

          <nav className="space-y-2">

            <Link
              href="/dashboard"
              className="block rounded-lg bg-slate-100 px-4 py-3 text-sm font-medium text-slate-900"
            >
              Dashboard
            </Link>

            <Link
              href="/dashboard/certificates/list"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              My Certificates
            </Link>

            <Link
              href="/dashboard/certificates"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              Create Certificate
            </Link>

            <Link
              href="/dashboard/templates"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              Templates
            </Link>

            <Link
              href="/dashboard/team"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              Team
            </Link>

            <Link
              href="/dashboard/settings"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              Settings
            </Link>

          </nav>

        </aside>

        {/* Main */}
        <section className="flex-1 p-6 md:p-10">

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900">
              Welcome to CertVerify
            </h2>

            <p className="mt-2 text-slate-600">
              Manage your certificates and verification activity.
            </p>
          </div>

          <div className="mb-8">
            <Link
              href="/dashboard/certificates"
              className="inline-flex rounded-lg bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800"
            >
              + Create Certificate
            </Link>
          </div>

          {/* Statistics */}
          <div className="grid gap-5 md:grid-cols-3">

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                Certificates
              </p>

              <p className="mt-3 text-3xl font-bold text-slate-900">
                {displayCount(certificateCount)}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Certificates issued
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                Templates
              </p>

              <p className="mt-3 text-3xl font-bold text-slate-900">
                {displayCount(templateCount)}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Saved templates
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium text-slate-500">
                Verifications
              </p>

              <p className="mt-3 text-3xl font-bold text-slate-900">
                {displayCount(verificationCount)}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Certificate scans
              </p>
            </div>

          </div>

        </section>
      </div>
    </main>
  );
}