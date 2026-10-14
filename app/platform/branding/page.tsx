"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { PlatformMfa } from "@/components/platform-mfa";
import { supabase } from "@/lib/supabase";
import { brandingFetch } from "@/lib/branding/client";
import type { BrandingReview } from "@/lib/branding/types";

function ReviewCard({ review,onChanged,reviewerId }: { review:BrandingReview;onChanged:()=>Promise<void>;reviewerId:string|null }) {
  const [reason,setReason]=useState("");const [recipient,setRecipient]=useState(review.request.requested_by);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function act(action:string,permissionId?:string) {
    setBusy(true);setError("");
    try { await brandingFetch("/api/platform/branding",{ method:"POST",headers:{ "Content-Type":"application/json" },body:JSON.stringify({ action,requestId:review.request.id,reason,userId:recipient,fields:review.fields,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString(),permissionId }) });await onChanged(); }
    catch(failure) { setError(failure instanceof Error ? failure.message : "Review failed."); }finally { setBusy(false); }
  }
  const pending=["pending","needs_information"].includes(review.request.status);
  const submittedByReviewer=reviewerId!==null && review.request.requested_by===reviewerId;
  const independentReviewer=reviewerId!==null && !submittedByReviewer;
  const logoNotIncluded=!review.request.logo_asset_id && !review.fields.includes("logo");
  return <article className="space-y-4 rounded border bg-white p-6">
    <h2 className="text-xl font-semibold">{review.current.company_name} — {review.request.status}</h2>
    <div className="grid gap-4 sm:grid-cols-2"><div><h3 className="font-semibold">Current branding</h3><p>{review.current.company_name}</p><p>{review.current.professional_details}</p>{review.current.logo_asset_id && <Image src={`/api/branding/logo/${review.current.logo_asset_id}`} alt="Current branding logo" width={96} height={96} unoptimized />}</div>
      <div><h3 className="font-semibold">Proposed branding</h3><p>{review.request.company_name}</p><p>{review.request.professional_details}</p>{review.request.logo_asset_id && <Image src={`/api/branding/logo/${review.request.logo_asset_id}`} alt="Proposed branding logo" width={96} height={96} unoptimized />}</div></div>
    <p>Requested by {review.request.requested_by}. Fields: {review.fields.join(", ")}.</p>
    {pending && submittedByReviewer && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      You submitted this branding request. For security, a different Super Admin must review it. You cannot approve, reject or grant permission for your own request.
    </p>}
    {pending && logoNotIncluded && <p className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">
      No new logo is attached to this request. To request logo approval, upload the logo from your organization&apos;s Branding page and submit a new change request.
    </p>}<p>{review.request.explanation}</p><p>Requested {new Date(review.request.created_at).toLocaleString("en-IN")}. Decision: {review.request.decision_reason || "Awaiting decision"}.</p>
    {pending && independentReviewer && <><label className="block">Review reason<textarea value={reason} onChange={(event)=>setReason(event.target.value)} maxLength={2000} className="block w-full border p-3" /></label>
      <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>{ void act("approve"); }} className="rounded bg-blue-700 px-4 py-2 text-white">Approve branding</button><button disabled={busy} onClick={()=>{ void act("reject"); }} className="rounded border px-4 py-2">Reject with reason</button><button disabled={busy} onClick={()=>{ void act("information"); }} className="rounded border px-4 py-2">Request information</button></div>
      <label className="block">Temporary permission recipient<select value={recipient} onChange={(event)=>setRecipient(event.target.value)} className="mt-2 block w-full border p-2">{(review.members ?? [{user_id:review.request.requested_by,email:"Requesting member",role:"member"}]).map((member)=><option key={member.user_id} value={member.user_id}>{member.email} ({member.role})</option>)}</select></label>
      <p className="text-sm">Permission applies only these proposed values and fields, for this account and user, for 24 hours. It is usable once.</p><button disabled={busy} onClick={()=>{ void act("grant"); }} className="rounded border px-4 py-2">Grant scoped 24-hour permission</button></>}
    {review.permissions.filter((p)=>!p.used_at && !p.revoked_at).map((permission)=><div key={permission.id}><p>{permission.fields.join(", ")} · expires {new Date(permission.expires_at).toLocaleString("en-IN")}</p><button disabled={busy} onClick={()=>{ void act("revoke_permission",permission.id); }} className="text-red-700">Revoke editing permission</button></div>)}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <p className="text-sm">Name changes: {review.history.filter((v,i)=>i>0 && v.company_name!==review.history[i-1].company_name).length}. Logo changes: {review.history.filter((v,i)=>i>0 && v.logo_asset_id!==review.history[i-1].logo_asset_id).length}.</p>
    <details><summary>Complete retained branding versions</summary>{review.history.map((version)=><p key={version.id}>{version.company_name} · {version.professional_details} · user {version.created_by || "Baseline"} · {version.logo_asset_id || "No logo"} · {new Date(version.created_at).toLocaleString("en-IN")} · approver {version.approved_by || "Initial baseline"}</p>)}</details>
    <details><summary>Approval, request and permission history</summary>{review.audit?.map((event)=><p key={event.id}>{event.action} · actor {event.actor_id} · {new Date(event.occurred_at).toLocaleString("en-IN")} · {JSON.stringify(event.details)}</p>)}</details>
  </article>;
}
type QueueReport={reviews:BrandingReview[];total:number;page:number;limit:number};
function Queue() {
  const [report,setReport]=useState<QueueReport|null>(null);const [status,setStatus]=useState("");const [error,setError]=useState("");const [reviewerId,setReviewerId]=useState<string|null>(null);
  async function load(page=report?.page ?? 1,nextStatus=status) { setError("");try{setReport(await brandingFetch(`/api/platform/branding?${new URLSearchParams({page:String(page),status:nextStatus})}`));}catch{setError("The secure review queue could not be loaded.");} }
  useEffect(()=>{let active=true;void supabase.auth.getUser().then(({data})=>{if(active)setReviewerId(data.user?.id ?? null);}).catch(()=>{if(active)setReviewerId(null);});void brandingFetch("/api/platform/branding").then((data)=>{if(active)setReport(data);}).catch(()=>{if(active)setError("The secure review queue could not be loaded.");});return()=>{active=false;};},[]);
  return <div className="space-y-6"><label>Request status<select value={status} onChange={(event)=>{const value=event.target.value;setStatus(value);void load(1,value);}} className="ml-3 rounded border p-2">{[["","All decisions"],["open","Open requests"],["pending","Pending"],["needs_information","Needs information"],["permission_granted","Permission granted"],["approved","Approved"],["rejected","Rejected"]].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    {error && <p role="alert">{error}</p>}{report && <><p>{report.total} branding requests</p>{!report.reviews.length && <p>No branding requests to review.</p>}{report.reviews.map((review)=><ReviewCard key={review.request.id} review={review} reviewerId={reviewerId} onChanged={()=>load()} />)}<div className="flex gap-4"><button disabled={report.page===1} onClick={()=>{void load(report.page-1);}}>Previous requests</button><span>Page {report.page}</span><button disabled={report.page*report.limit>=report.total} onClick={()=>{void load(report.page+1);}}>Next requests</button></div></>}
  </div>;
}
export default function PlatformBrandingPage() {
  return <main className="mx-auto max-w-5xl space-y-6 px-6 py-8"><h1 className="text-3xl font-bold">Platform branding approvals</h1><p>Platform administration is separate from customer organization roles. All decisions are authorized and audited.</p><PlatformMfa><Queue /></PlatformMfa></main>;
}
