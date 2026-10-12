"use client";
import { useEffect,useState } from "react";
import { PlatformMfa } from "@/components/platform-mfa";
import { platformFetch } from "@/lib/platform/client";
import type { AuditEvent } from "@/lib/platform/types";
type Report={total:number;page:number;events:AuditEvent[]};
function Audit(){
  const [report,setReport]=useState<Report|null>(null);const [error,setError]=useState("");const [account,setAccount]=useState("");const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;const params=new URLSearchParams(window.location.search);void platformFetch<Report>(`/api/platform/audit?${params}`).then((data)=>{if(active){setReport(data);setAccount(params.get("account") ?? "");}}).catch((failure)=>{if(active)setError(failure.message);});return()=>{active=false;};},[]);
  async function load(page:number){setBusy(true);setError("");try{setReport(await platformFetch<Report>(`/api/platform/audit?${new URLSearchParams({page:String(page),...(account ? {account} : {})})}`));}catch(failure){setError(failure instanceof Error ? failure.message : "History could not be loaded.");}finally{setBusy(false);}}
  return <div className="space-y-4">{error && <p role="alert">{error}</p>}{!report && !error && <p>Loading audit history…</p>}{report && <><p>{report.total} retained administrative events{account ? " for this account" : ""}. Viewing history is also audited.</p>{report.events.map((event)=><article key={event.id} className="rounded border bg-white p-4"><h2 className="font-semibold">{event.action}</h2><p className="text-sm">{new Date(event.occurred_at).toLocaleString("en-IN")} · administrator {event.actor_id}</p>{event.account_id && <p className="text-sm">Account {event.account_id}</p>}{typeof event.details?.reason==="string" && <p>Reason: {event.details.reason}</p>}{typeof event.details?.previous_status==="string" && <p>{event.details.previous_status} → {String(event.details.status)}</p>}</article>)}<div className="flex gap-4"><button disabled={busy || report.page===1} onClick={()=>{void load(report.page-1);}}>Previous events</button><span>Page {report.page}</span><button disabled={busy || report.page*50>=report.total} onClick={()=>{void load(report.page+1);}}>Next events</button></div></>}</div>;
}
export default function PlatformAuditPage(){return <main className="mx-auto max-w-5xl space-y-6 px-6 py-8"><h1 className="text-3xl font-bold">Immutable administrative history</h1><PlatformMfa><Audit /></PlatformMfa></main>;}
