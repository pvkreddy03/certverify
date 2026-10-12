"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { PlatformMfa } from "@/components/platform-mfa";
import { platformFetch } from "@/lib/platform/client";
import type { PlatformOverview } from "@/lib/platform/types";
function Overview() {
  const [report,setReport]=useState<PlatformOverview|null>(null);const [error,setError]=useState("");
  useEffect(()=>{ let active=true;void platformFetch<PlatformOverview>("/api/platform/overview").then((data)=>{ if(active) setReport(data); }).catch((failure)=>{ if(active) setError(failure.message); });return()=>{active=false;}; },[]);
  if(error) return <p role="alert">{error}</p>;if(!report) return <p role="status">Loading platform statistics…</p>;
  const metrics=[["Registered accounts",report.accounts],["Individual accounts",report.individual_accounts],["Organization accounts",report.organization_accounts],["Total registered users",report.users],["Certificates issued",report.certificates],["Active certificates",report.active_certificates],["Inactive certificates",report.inactive_certificates],["Revoked certificates",report.revoked_certificates]];
  const maximum=Math.max(1,...report.issuance_daily.map((day)=>day.count));
  return <div className="space-y-8">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label,value])=><section key={label} className="rounded border bg-white p-5"><h2 className="text-sm text-slate-600">{label}</h2><p className="mt-2 text-3xl font-semibold">{value}</p></section>)}</div>
    <section className="rounded border bg-white p-6"><h2 className="text-xl font-semibold">Customer access</h2><div className="mt-4 flex flex-wrap gap-6">{Object.entries(report.access_statuses ?? {}).map(([status,count])=><Link key={status} href={`/platform/accounts?status=${status}`}>{status}: {count}</Link>)}</div></section>
    <section className="rounded border bg-white p-6"><h2 className="text-xl font-semibold">Subscription status</h2><p className="mt-2 text-slate-600">Unknown means no reliable subscription record is available. Status summaries do not activate billing or establish payment entitlement.</p><div className="mt-4 flex flex-wrap gap-6">{Object.entries(report.subscription_statuses ?? {}).map(([status,count])=><Link key={status} href={`/platform/accounts?subscription=${status}`}>{status.replaceAll("_"," ")}: {count}</Link>)}</div></section>
    <section className="rounded border bg-white p-6"><h2 className="text-xl font-semibold">Certificate issuance — last 30 days (UTC)</h2><p className="mt-2 text-sm text-slate-600">Counts only. Private certificate contents are excluded.</p><div className="mt-4 space-y-2">{report.issuance_daily.map((day)=><div key={day.date} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm"><span>{day.date}</span><div className="h-3 rounded bg-slate-100"><div className="h-3 rounded bg-blue-600" style={{ width:`${day.count/maximum*100}%` }} /></div><span>{day.count}</span></div>)}</div></section>
    <p className="text-sm text-slate-500">Report generated {new Date(report.generated_at).toLocaleString("en-IN")}. User totals include registered users without a current membership; member totals are shown separately per account.</p>
  </div>;
}
export default function PlatformPage() { return <main className="mx-auto max-w-6xl space-y-6 px-6 py-8"><h1 className="text-3xl font-bold">Platform overview</h1><PlatformMfa><Overview /></PlatformMfa></main>; }
