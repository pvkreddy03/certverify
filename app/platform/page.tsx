"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlatformMfa } from "@/components/platform-mfa";
import { platformFetch } from "@/lib/platform/client";
import type { PlatformOverview } from "@/lib/platform/types";

const actions = [
  { href:"/platform/accounts", title:"Manage customers", description:"Search accounts, review access and account status", icon:"◎" },
  { href:"/platform/subscriptions", title:"Subscriptions", description:"Check account plans, renewals and entitlement", icon:"◷" },
  { href:"/platform/payments", title:"Payment review", description:"Review transactions and payment reconciliation", icon:"₹" },
  { href:"/platform/pricing", title:"Plans and offers", description:"Configure pricing and published offers", icon:"◇" },
  { href:"/platform/branding", title:"Branding approvals", description:"Review and decide pending branding requests", icon:"✓" },
  { href:"/platform/contact", title:"Support and contact", description:"Manage public contact details", icon:"✉" },
  { href:"/platform/audit", title:"Audit trail", description:"Review administrator actions", icon:"☷" },
  { href:"/platform/geo", title:"Geo intelligence", description:"MFA-protected, aggregated regional map analytics", icon:"⌖" },
];

function Overview() {
  const [report, setReport] = useState<PlatformOverview | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void platformFetch<PlatformOverview>("/api/platform/overview")
      .then(data => { if(active) setReport(data); })
      .catch(failure => { if(active) setError(failure.message); });
    return () => { active = false; };
  }, []);
  if (error) return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800">{error}</p>;
  if (!report) return <p role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700">Loading platform statistics…</p>;

  const metrics = [
    ["Registered accounts", report.accounts],
    ["Active certificates", report.active_certificates],
    ["Certificates issued", report.certificates],
    ["Total registered users", report.users],
    ["Organization accounts", report.organization_accounts],
    ["Individual accounts", report.individual_accounts],
    ["Inactive certificates", report.inactive_certificates],
    ["Revoked certificates", report.revoked_certificates],
  ];
  const maximum = Math.max(1, ...report.issuance_daily.map(day => day.count));

  return <div className="space-y-8">
    <section aria-label="Platform key statistics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map(([label,value]) => <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-500">{label}</h2>
        <p className="mt-2 text-3xl font-extrabold tracking-tight text-[#17344c]">{Number(value).toLocaleString("en-IN")}</p>
      </article>)}
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-extrabold text-slate-900">Customer account access</h2>
        <p className="mt-1 text-sm text-slate-500">Choose a status to review the matching accounts.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.entries(report.access_statuses ?? {}).map(([status,count]) =>
            <Link key={status} className="rounded-full border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-100" href={`/platform/accounts?status=${encodeURIComponent(status)}`}>{status.replaceAll("_"," ")}: {count}</Link>)}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-extrabold text-slate-900">Subscriptions at a glance</h2>
        <p className="mt-1 text-sm text-slate-500">Unknown means no confirmed record. A displayed status does not activate payments.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {Object.entries(report.subscription_statuses ?? {}).map(([status,count]) =>
            <Link key={status} className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100" href={`/platform/accounts?subscription=${encodeURIComponent(status)}`}>{status.replaceAll("_"," ")}: {count}</Link>)}
        </div>
      </div>
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-extrabold text-slate-900">Certificate issuance · Last 30 days (UTC)</h2>
      <p className="mt-1 text-sm text-slate-500">Counts only; certificate contents are never shown in these statistics.</p>
      <div className="mt-5 max-h-80 space-y-2 overflow-y-auto">
        {report.issuance_daily.map(day => <div key={day.date} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3 text-sm">
          <span className="tabular-nums text-slate-500">{day.date}</span>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-teal-600" style={{width:`${day.count/maximum*100}%`}} />
          </div>
          <span className="text-right font-semibold tabular-nums text-slate-800">{day.count}</span>
        </div>)}
      </div>
    </section>
    <p className="text-xs text-slate-500">Report generated {new Date(report.generated_at).toLocaleString("en-IN")}. Reports are read-only until you take an authorized action.</p>
  </div>;
}

export default function PlatformPage() {
  return <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
    <section className="rounded-3xl bg-gradient-to-r from-[#102b47] via-[#184b57] to-[#087e75] p-7 text-white shadow-lg sm:p-9">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-200">Platform control center</p>
      <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Manage CertVerify with confidence.</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-teal-50">View subscriptions, organizations, security and customer activity from one place. Administrative changes remain access-controlled and audited.</p>
    </section>
    <section>
      <h2 className="mb-4 text-xl font-extrabold text-[#17344c]">Quick actions</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map(action => <Link href={action.href} key={action.href} className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-2xl font-bold text-teal-800">{action.icon}</span>
          <span><span className="block font-extrabold text-slate-900 group-hover:text-teal-700">{action.title} →</span><span className="mt-1 block text-sm leading-5 text-slate-500">{action.description}</span></span>
        </Link>)}
      </div>
    </section>
    <section>
      <h2 className="mb-4 text-xl font-extrabold text-[#17344c]">Business overview</h2>
      <PlatformMfa><Overview /></PlatformMfa>
    </section>
  </main>;
}
