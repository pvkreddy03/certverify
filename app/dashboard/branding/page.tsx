"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { selectedAccountId, canManageAccount, type AccountMembership } from "@/lib/accounts/context";
import { brandingFetch } from "@/lib/branding/client";
import type { BrandingProfile } from "@/lib/branding/types";

export default function BrandingPage() {
  const [profile,setProfile]=useState<BrandingProfile|null>(null);
  const [authorized,setAuthorized]=useState(false);
  const [name,setName]=useState(""); const [details,setDetails]=useState("");
  const [logo,setLogo]=useState<string|null>(null); const [explanation,setExplanation]=useState("");
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  async function load() {
    const [data,accounts]=await Promise.all([brandingFetch("/api/branding"),supabase.rpc("cv_list_accounts")]);
    const account=(accounts.data as AccountMembership[]|null)?.find((item)=>item.id===selectedAccountId());
    setAuthorized(!!account && canManageAccount(account.role));
    setProfile(data);setName(data.current?.company_name ?? "");setDetails(data.current?.professional_details ?? "");setLogo(data.current?.logo_asset_id ?? null);
  }
  useEffect(()=>{
    let active=true;
    void Promise.all([brandingFetch("/api/branding"),supabase.rpc("cv_list_accounts")]).then(([data,accounts])=>{
      if (!active) return;
      const account=(accounts.data as AccountMembership[]|null)?.find((item)=>item.id===selectedAccountId());
      setAuthorized(!!account && canManageAccount(account.role));setProfile(data);
      setName(data.current?.company_name ?? "");setDetails(data.current?.professional_details ?? "");setLogo(data.current?.logo_asset_id ?? null);
    }).catch(()=>{ if (active) setMessage("Branding could not be loaded. Please retry later."); });
    return()=>{ active=false; };
  },[]);
  async function act(body:Record<string,unknown>) {
    setBusy(true);setMessage("");
    try { await brandingFetch("/api/branding/requests",{ method:"POST",headers:{ "Content-Type":"application/json" },body:JSON.stringify(body) });await load();setMessage(body.action==="request" ? "Branding change submitted for Super Admin approval." : "Branding action completed."); }
    catch(error) { setMessage(error instanceof Error ? error.message : "Could not complete the request."); }
    finally { setBusy(false); }
  }
  async function upload(file:File) {
    const form=new FormData();form.set("logo",file);setBusy(true);setMessage("");
    try { const data=await brandingFetch("/api/branding/logo",{ method:"POST",body:form });setLogo(data.assetId);setMessage("Logo uploaded privately. Submit your change request for approval."); }
    catch(error) { setMessage(error instanceof Error ? error.message : "Upload failed."); }finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
    <h1 className="text-3xl font-bold">Professional and organization branding</h1>
    <p>Company name, professional details and logo are managed centrally. Changes require Super Admin approval or an approved, scoped permission.</p>
    {message && <p role="status" className="rounded border p-4">{message}</p>}
    {profile?.current && <section className="rounded border bg-white p-6"><h2 className="text-xl font-semibold">Current approved identity</h2>
      <p className="mt-3 font-medium">{profile.current.company_name}</p><p className="whitespace-pre-wrap">{profile.current.professional_details}</p>
      {profile.current.logo_asset_id && <Image src={`/api/branding/logo/${profile.current.logo_asset_id}?account=${selectedAccountId()}`} alt="Current issuer logo" width={128} height={128} unoptimized className="object-contain" />}
    </section>}
    {authorized && profile && <form onSubmit={(event)=>{ event.preventDefault();void act({ action:"request",companyName:name,professionalDetails:details,logoAssetId:logo,explanation }); }} className="space-y-4 rounded border bg-white p-6">
      <h2 className="text-xl font-semibold">Request branding change</h2>
      <label className="block">Company or professional name<input className="mt-2 block w-full rounded border p-3" value={name} onChange={(event)=>setName(event.target.value)} minLength={2} maxLength={160} required disabled={busy} /></label>
      <label className="block">Public professional details<textarea className="mt-2 block w-full rounded border p-3" value={details} onChange={(event)=>setDetails(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <label className="block">Proposed logo<input className="mt-2 block" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event)=>{ const file=event.target.files?.[0];if (file) void upload(file); }} /></label>
      <p className="text-sm text-slate-600">Static PNG, JPEG or WebP, up to 2 MB and 4096 × 4096 pixels. Logos are normalized and metadata is removed.</p>
      {logo && <><Image src={`/api/branding/logo/${logo}?account=${selectedAccountId()}`} alt="Proposed issuer logo" width={96} height={96} unoptimized /><button type="button" disabled={busy} onClick={()=>setLogo(null)} className="text-red-700">Request logo removal</button></>}
      <label className="block">Explanation (optional)<textarea className="mt-2 block w-full rounded border p-3" value={explanation} onChange={(event)=>setExplanation(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <button disabled={busy} className="rounded bg-blue-700 px-5 py-2 text-white">Submit for approval</button>
    </form>}
    {profile?.permissions.filter((p)=>p.proposal && !p.used_at && !p.revoked_at).map((permission)=><section key={permission.id} className="rounded border bg-blue-50 p-6">
      <h2 className="font-semibold">Temporary approved editing permission</h2><p>Fields: {permission.fields.join(", ")}. Expires: {new Date(permission.expires_at).toLocaleString("en-IN")}</p><p>Approved identity: {permission.proposal?.company_name}</p><p>{permission.proposal?.professional_details}</p>
      {permission.proposal?.logo_asset_id && <Image src={`/api/branding/logo/${permission.proposal.logo_asset_id}?account=${selectedAccountId()}`} alt="Permission approved logo" width={96} height={96} unoptimized />}
      <button disabled={busy} onClick={()=>{ void act({ action:"apply",permissionId:permission.id }); }} className="mt-3 rounded bg-blue-700 px-4 py-2 text-white">Apply approved changes</button>
    </section>)}
    {!!profile?.requests.length && <section className="space-y-3"><h2 className="text-xl font-semibold">Requests and decisions</h2>{profile.requests.map((request)=><article key={request.id} className="rounded border p-4"><p>{request.company_name} — {request.status}</p><p>{request.decision_reason}</p>{request.status==="needs_information" && <form onSubmit={(event)=>{ event.preventDefault();const form=new FormData(event.currentTarget);void act({ action:"information",requestId:request.id,message:form.get("message") }); }}><label>Additional information<textarea name="message" required maxLength={2000} className="block w-full border p-2" /></label><button disabled={busy} className="text-blue-700">Supply information</button></form>}</article>)}</section>}
    {!!profile?.versions.length && <section className="space-y-3"><h2 className="text-xl font-semibold">Immutable branding history</h2>{profile.versions.map((version)=><article key={version.id} className="rounded border p-4"><p>{version.company_name}</p><p>{version.professional_details}</p><p className="text-sm">{new Date(version.created_at).toLocaleString("en-IN")} · {version.approved_by ? `Approved by ${version.approved_by}` : "Initial identity baseline"} · user {version.created_by || "Baseline"} · {version.logo_asset_id ? "Logo version retained" : "No logo"}</p></article>)}</section>}
    {!!profile?.audit.length && <section><h2 className="text-xl font-semibold">Approval and permission audit</h2>{profile.audit.map((event)=><p key={event.id} className="mt-2 text-sm">{event.action} · {event.actor_id} · {new Date(event.occurred_at).toLocaleString("en-IN")}</p>)}</section>}
  </main>;
}
