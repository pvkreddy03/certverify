"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function DashboardPage() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setEmail(user.email ?? "");
      }
    }

    getUser();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-slate-50">

      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between px-6">

          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 font-bold text-white">
              C
            </div>

            <span className="text-xl font-bold text-slate-900">
              CertVerify
            </span>
          </div>

          <div className="flex items-center gap-4">

            <div className="hidden text-right sm:block">
              <p className="text-xs text-slate-500">
                Signed in as
              </p>

              <p className="text-sm font-medium text-slate-700">
                {email || "Professional"}
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>

          </div>
        </div>
      </header>

      <div className="flex">

        {/* Sidebar */}
        <aside className="hidden min-h-[calc(100vh-4rem)] w-64 border-r border-slate-200 bg-white p-5 md:block">

          <nav className="space-y-2">

            <a
              href="/dashboard"
              className="block rounded-lg bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700"
            >
              Dashboard
            </a>

            <a
              href="#"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Certificates
            </a>

            <a
              href="#"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Templates
            </a>

            <a
              href="#"
              className="block rounded-lg px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Settings
            </a>

          </nav>

        </aside>

        {/* Main Content */}
        <section className="flex-1 p-6 lg:p-10">

          <div className="mx-auto max-w-6xl">

            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">

              <div>
                <p className="text-sm font-medium text-blue-600">
                  Dashboard
                </p>

                <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
                  Welcome to CertVerify
                </h1>

                <p className="mt-2 text-slate-600">
                  Manage your certificates, templates and verification records.
                </p>
              </div>

              <button
                className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                + Create Certificate
              </button>

            </div>

            {/* Statistics */}
            <div className="mt-10 grid gap-5 sm:grid-cols-3">

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                  Certificates
                </p>

                <p className="mt-3 text-3xl font-bold text-slate-900">
                  0
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Certificates issued
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                  Templates
                </p>

                <p className="mt-3 text-3xl font-bold text-slate-900">
                  0
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Saved templates
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-medium text-slate-500">
                  Verifications
                </p>

                <p className="mt-3 text-3xl font-bold text-slate-900">
                  0
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  Certificate scans
                </p>
              </div>

            </div>

            {/* Getting Started */}
            <div className="mt-8 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">

              <h2 className="text-xl font-bold text-slate-900">
                Get started with CertVerify
              </h2>

              <p className="mt-2 max-w-2xl text-slate-600">
                Create your first certificate template and start generating
                secure QR verification records.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">

                <div className="rounded-lg border border-slate-200 p-5">
                  <div className="text-sm font-semibold text-blue-600">
                    STEP 1
                  </div>

                  <h3 className="mt-2 font-semibold text-slate-900">
                    Create a template
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Define the fields you want to use for your certificates.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-5">
                  <div className="text-sm font-semibold text-blue-600">
                    STEP 2
                  </div>

                  <h3 className="mt-2 font-semibold text-slate-900">
                    Create a certificate
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Enter the information for your client or assignment.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 p-5">
                  <div className="text-sm font-semibold text-blue-600">
                    STEP 3
                  </div>

                  <h3 className="mt-2 font-semibold text-slate-900">
                    Generate QR
                  </h3>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Generate a unique verification QR code for your document.
                  </p>
                </div>

              </div>

            </div>

          </div>

        </section>

      </div>

    </main>
  );
}