"use client";
import { useEffect,useState } from "react";
import { PlatformAdminGuide } from "@/components/platform-admin-guide";
import Link from "next/link";
import { PlatformMfa } from "@/components/platform-mfa";
import { platformFetch } from "@/lib/platform/client";
import { ACCESS_STATUSES,SUBSCRIPTION_STATUSES,type PlatformAccount } from "@/lib/platform/types";
type Report={accounts:PlatformAccount[];total:number;page:number;limit:number};
function Accounts() {
  const [report,setReport]=useState<Report|null>(null);const [search,setSearch]=useState("");
  const [type,setType]=useState("");const [status,setStatus]=useState("");const [subscription,setSubscription]=useState("");
  const [error,setError]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{ let active=true;const params=new URLSearchParams(window.location.search);
    const requestedStatus=params.get("status") ?? "";const requestedSubscription=params.get("subscription") ?? "";
    void platformFetch<Report>(`/api/platform/accounts?${params}`).then((data)=>{ if(active) { setReport(data);setStatus(requestedStatus);setSubscription(requestedSubscription); } }).catch((failure)=>{if(active) setError(failure.message);});return()=>{active=false;};
  },[]);
  async function load(page=1) {
    setBusy(true);setError("");try { const params=new URLSearchParams({search,type,status,subscription,page:String(page)});setReport(await platformFetch<Report>(`/api/platform/accounts?${params}`)); }catch(failure){setError(failure instanceof Error ? failure.message : "Account report failed.");}finally{setBusy(false);}
  }
  return <div className="space-y-6"><form className="flex flex-wrap items-end gap-4" onSubmit={(event)=>{event.preventDefault();void load();}}>
    <label>Search accounts<input value={search} onChange={(event)=>setSearch(event.target.value)} maxLength={200} placeholder="Name, code or owner email" className="mt-2 block rounded border p-2" /></label>
    <label>Account type<select value={type} onChange={(event)=>setType(event.target.value)} className="mt-2 block rounded border p-2"><option value="">All types</option><option value="individual">Individual</option><option value="organization">Organization</option></select></label>
    <label>Access status<select value={status} onChange={(event)=>setStatus(event.target.value)} className="mt-2 block rounded border p-2"><option value="">All access states</option>{ACCESS_STATUSES.map((value)=><option key={value}>{value}</option>)}</select></label>
    <label>Subscription status<select value={subscription} onChange={(event)=>setSubscription(event.target.value)} className="mt-2 block rounded border p-2"><option value="">All subscription states</option>{SUBSCRIPTION_STATUSES.map((value)=><option key={value} value={value}>{value.replaceAll("_"," ")}</option>)}</select></label>
    <button disabled={busy} className="rounded bg-blue-700 px-4 py-2 text-white">Apply filters</button>
  </form>{error && <p role="alert">{error}</p>}{!report && !error && <p role="status">Loading accounts…</p>}
    {report && <><p>{report.total} matching accounts</p><div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{["Account","Type","Access","Subscription","Active members","Certificates"].map((name)=><th className="border-b p-3" key={name}>{name}</th>)}</tr></thead><tbody>{report.accounts.map((account)=><tr key={account.id}><td className="border-b p-3"><Link className="text-blue-700" href={`/platform/accounts/${account.id}`}>{account.name}</Link><p className="text-xs text-slate-500">{account.account_code}</p></td><td className="border-b p-3">{account.account_type}</td><td className="border-b p-3">{account.access_status}</td><td className="border-b p-3">{account.subscription_status.replaceAll("_"," ")}</td><td className="border-b p-3">{account.member_count}</td><td className="border-b p-3">{account.certificate_count}</td></tr>)}</tbody></table></div>
      {!report.accounts.length && <p>No matching accounts.</p>}<div className="flex items-center gap-4"><button disabled={busy || report.page===1} onClick={()=>{void load(report.page-1);}} className="rounded border px-4 py-2">Previous page</button><span>Page {report.page}</span><button disabled={busy || report.page*report.limit>=report.total} onClick={()=>{void load(report.page+1);}} className="rounded border px-4 py-2">Next page</button></div></>}
  </div>;
}
export default function PlatformAccountsPage() { return <main className="mx-auto max-w-6xl space-y-6 px-6 py-8"><h1 className="text-3xl font-bold">Customer accounts</h1><PlatformAdminGuide section="accounts" /><PlatformMfa><Accounts /></PlatformMfa></main>; }
