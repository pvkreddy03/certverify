"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PlatformMfa } from "@/components/platform-mfa";
import { supabase } from "@/lib/supabase";
import { selectedAccountId, canManageAccount, type AccountMembership } from "@/lib/accounts/context";
import { brandingFetch } from "@/lib/branding/client";
import type { BrandingProfile } from "@/lib/branding/types";

export default function BrandingPage() {
  const [profile,setProfile]=useState<BrandingProfile|null>(null);
  const [authorized,setAuthorized]=useState(false);
  const [internalOwner,setInternalOwner]=useState(false);
  const [roleReady,setRoleReady]=useState(false);
  const [name,setName]=useState(""); const [details,setDetails]=useState("");
  const [logo,setLogo]=useState<string|null>(null); const [explanation,setExplanation]=useState("");
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [directSaved,setDirectSaved]=useState(false);
  const submissionLocked=useRef(false);

  useEffect(() => {
    if (!submitted) return;
    const timer = window.setTimeout(() => window.location.replace("/dashboard"), 2500);
    return () => window.clearTimeout(timer);
  }, [submitted]);
  const [selectedLogoName,setSelectedLogoName]=useState("");
  const [uploadState,setUploadState]=useState<"idle"|"uploading"|"ready"|"failed">("idle");
  async function load() {
    const [data,accounts,admin]=await Promise.all([
      brandingFetch("/api/branding"),supabase.rpc("cv_list_accounts"),supabase.rpc("cv_platform_identity"),
    ]);
    const account=(accounts.data as AccountMembership[]|null)?.find((item)=>item.id===selectedAccountId());
    setAuthorized(!!account && canManageAccount(account.role));
    const isInternalOwner=account?.role==="owner" && admin.data===true && !admin.error;
    const earlierProposal=isInternalOwner
      ? data.requests.find((entry)=>["pending","needs_information","permission_granted"].includes(entry.status))
      : null;
    setInternalOwner(isInternalOwner);
    setRoleReady(true);
    setProfile(data);
    setName(earlierProposal?.company_name ?? data.current?.company_name ?? "");
    setDetails(earlierProposal?.professional_details ?? data.current?.professional_details ?? "");
    setLogo(earlierProposal ? earlierProposal.logo_asset_id : (data.current?.logo_asset_id ?? null));
  }
  useEffect(()=>{
    let active=true;
    void Promise.all([brandingFetch("/api/branding"),supabase.rpc("cv_list_accounts"),supabase.rpc("cv_platform_identity")]).then(([data,accounts,admin])=>{
      if (!active) return;
      const account=(accounts.data as AccountMembership[]|null)?.find((item)=>item.id===selectedAccountId());
      setAuthorized(!!account && canManageAccount(account.role));
      const isInternalOwner=account?.role==="owner" && admin.data===true && !admin.error;
      const earlierProposal=isInternalOwner
        ? data.requests.find((entry)=>["pending","needs_information","permission_granted"].includes(entry.status))
        : null;
      setInternalOwner(isInternalOwner);
      setRoleReady(true);
      setProfile(data);
      setName(earlierProposal?.company_name ?? data.current?.company_name ?? "");
      setDetails(earlierProposal?.professional_details ?? data.current?.professional_details ?? "");
      setLogo(earlierProposal ? earlierProposal.logo_asset_id : (data.current?.logo_asset_id ?? null));
    }).catch(()=>{ if (active) setMessage("Branding could not be loaded. Please retry later."); });
    return()=>{ active=false; };
  },[]);
  async function act(body:Record<string,unknown>) {
    const isNewRequest=body.action==="request" || body.action==="direct";
    if (submitted || busy || (isNewRequest && submissionLocked.current)) return;
    // Synchronous lock prevents two clicks from racing React's disabled state.
    if (isNewRequest) submissionLocked.current=true;
    setBusy(true);setMessage("");
    try {
      const result = await brandingFetch("/api/branding/requests",{
        method:"POST",headers:{ "Content-Type":"application/json" },body:JSON.stringify(body),
      });
      if (isNewRequest) {
        // A verified owner direct-save is active immediately; regular customers
        // still require independent branding approval.
        const isDirect=body.action==="direct";
        setDirectSaved(isDirect);
        setSubmitted(true);
        setMessage(isDirect ? (result.status==="unchanged"
          ? "Current branding is already active. Old pending requests were closed."
          : "Branding saved and activated immediately.") :
          "Branding change submitted for Super Admin approval.");
        return;
      }
      await load();
      setMessage("Branding action completed.");
    } catch(error) {
      setMessage(error instanceof Error ? error.message : "Could not complete the request.");
      if(isNewRequest) submissionLocked.current=false;
    } finally { setBusy(false); }
  }
  async function upload(file:File) {
    setSelectedLogoName(file.name);
    setMessage("");
    // Selecting a filename is not a successful upload. Require confirmation
    // from both the upload API and the private image preview.
    setUploadState("uploading");
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>2097152 || file.size===0) {
      setUploadState("failed");
      setMessage("Logo upload failed. Choose a valid JPEG, PNG, or WebP image under 2 MB. No new image has been submitted.");
      return;
    }
    const form=new FormData();form.set("logo",file);
    setBusy(true);
    try {
      const data=await brandingFetch("/api/branding/logo",{ method:"POST",body:form });
      if (typeof data.assetId!=="string" || !/^[0-9a-f-]{36}$/i.test(data.assetId)) throw new Error("Upload confirmation missing.");
      const preview=await fetch(`/api/branding/logo/${encodeURIComponent(data.assetId)}?account=${encodeURIComponent(selectedAccountId() ?? "")}`,{cache:"no-store"});
      if (!preview.ok || !(preview.headers.get("content-type") ?? "").startsWith("image/webp")) {
        throw new Error("The uploaded image could not be verified in storage.");
      }
      setLogo(data.assetId);
      setUploadState("ready");
      setMessage(internalOwner
        ? "Logo uploaded privately and verified. Save your branding to activate it immediately."
        : "Logo uploaded privately and image verified. Check the preview below, then submit the branding change for Super Admin approval.");
    } catch(error) {
      setUploadState("failed");
      setMessage("Logo upload did not complete successfully. The selected filename alone does not mean an image was saved. "+(error instanceof Error ? error.message : "Retry the upload.")+" Do not submit for approval until you see 'Image verified'.");
    } finally { setBusy(false); }
  }
  const editor = authorized && profile && roleReady ? <form onSubmit={(event)=>{ event.preventDefault();
      if(uploadState==="failed"||uploadState==="uploading") {setMessage("The logo has not been verified. Upload the image successfully before submitting the branding request.");return;}
      void act({ action:internalOwner ? "direct" : "request",companyName:name,professionalDetails:details,logoAssetId:logo,explanation });
    }} className="space-y-4 rounded border bg-white p-6">
      <h2 className="text-xl font-semibold">{internalOwner ? "Save organization branding" : "Request branding change"}</h2>
      {internalOwner && profile.requests.some((r)=>["pending","needs_information","permission_granted"].includes(r.status)) &&
        <p className="rounded border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">The form is prefilled with your earlier pending branding request. Review it, then save directly; the old request will be closed.</p>}
      {!internalOwner && profile.requests.some((r)=>["pending","needs_information","permission_granted"].includes(r.status)) &&
        <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">A request is already awaiting review. See the Requests and decisions section below; another request cannot be sent until it is resolved.</p>}
      <label className="block">Company or professional name<input className="mt-2 block w-full rounded border p-3" value={name} onChange={(event)=>setName(event.target.value)} minLength={2} maxLength={160} required disabled={busy} /></label>
      <label className="block">Public professional details<textarea className="mt-2 block w-full rounded border p-3" value={details} onChange={(event)=>setDetails(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <label className="block">Proposed logo<input className="mt-2 block" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event)=>{ const file=event.target.files?.[0];if (file) void upload(file); }} /></label>
      {selectedLogoName && <div role="note" className={`rounded-lg border p-4 text-sm ${uploadState==="ready" ? "border-green-300 bg-green-50 text-green-900" : uploadState==="failed" ? "border-red-300 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900"}`}>
        <p className="font-semibold">{uploadState==="uploading" ? "Uploading and checking image…" : uploadState==="ready" ? "Image verified — ready for approval request" : "Upload failed — image NOT ready for approval"}</p>
        <p className="mt-1 break-all">{selectedLogoName}</p>
      </div>}
      <p className="text-sm text-slate-600">Static PNG, JPEG or WebP, up to 2 MB and 4096 × 4096 pixels. Logos are normalized and metadata is removed.</p>
      {logo && <><Image src={`/api/branding/logo/${logo}?account=${selectedAccountId()}`} alt="Proposed issuer logo" width={96} height={96} unoptimized /><button type="button" disabled={busy} onClick={()=>setLogo(null)} className="text-red-700">Request logo removal</button></>}
      <label className="block">Explanation (optional)<textarea className="mt-2 block w-full rounded border p-3" value={explanation} onChange={(event)=>setExplanation(event.target.value)} maxLength={2000} disabled={busy} /></label>
      <button disabled={busy || submitted || uploadState==="uploading" || uploadState==="failed" ||
          (!internalOwner && profile.requests.some((r)=>["pending","needs_information","permission_granted"].includes(r.status)))}
        className="rounded bg-blue-700 px-5 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Saving…" : internalOwner ? "Save branding now" : "Submit for approval"}
      </button>
    </form> : null;

  return <main className="cv-page min-h-screen"><div className="mx-auto max-w-5xl space-y-6 px-4 py-9 sm:px-6">
    <p className="cv-eyebrow mb-2">TRUSTED ISSUER IDENTITY</p><h1 className="text-3xl font-extrabold tracking-tight text-[#1d3048]">Professional and organization branding</h1>
    <p>{internalOwner
      ? "As the verified platform owner, you can update your own workspace branding directly after MFA verification. Other organizations still require an independent approval."
      : "Company name, professional details and logo are managed centrally. Changes require Super Admin approval or an approved, scoped permission."}</p>
    {message && <p role="status" className="rounded border p-4">{message}</p>}
    {submitted && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="branding-submitted-title" aria-describedby="branding-submitted-info"
        className="w-full max-w-md space-y-4 rounded-2xl border border-green-200 bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700" aria-hidden="true">✓</div>
        <h2 id="branding-submitted-title" className="text-2xl font-bold text-slate-900">{directSaved ? "Branding saved and active" : "Submitted for approval"}</h2>
        <p id="branding-submitted-info" className="text-sm leading-relaxed text-slate-600">
          {directSaved
            ? "Your updated branding is now active for your organization. You will return to your dashboard automatically."
            : "Your branding request has been sent to a different Super Admin for independent review. You will return to your dashboard automatically."}
        </p>
        <button type="button" onClick={() => window.location.replace("/dashboard")}
          className="rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800">
          Go to dashboard
        </button>
      </section>
    </div>}
    {profile?.current && !profile.current.logo_asset_id && <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
      Your approved name and professional details do not include a logo image. Upload a PNG, JPEG or WebP image below, then {internalOwner ? "save your identity after MFA verification" : "submit it for independent Super Admin approval"}. Already-issued certificates retain their original approved identity.
    </p>}
    {profile?.current && <section className="rounded border bg-white p-6"><h2 className="text-xl font-semibold">Current approved identity</h2>
      <p className="mt-3 font-medium">{profile.current.company_name}</p><p className="whitespace-pre-wrap">{profile.current.professional_details}</p>
      {profile.current.logo_asset_id && <Image src={`/api/branding/logo/${profile.current.logo_asset_id}?account=${selectedAccountId()}`} alt="Current issuer logo" width={128} height={128} unoptimized className="object-contain" />}
    </section>}
    {editor ? (internalOwner ? <PlatformMfa>{editor}</PlatformMfa> : editor) : null}
    {profile?.permissions.filter((p)=>p.proposal && !p.used_at && !p.revoked_at).map((permission)=><section key={permission.id} className="rounded border bg-blue-50 p-6">
      <h2 className="font-semibold">Temporary approved editing permission</h2><p>Fields: {permission.fields.join(", ")}. Expires: {new Date(permission.expires_at).toLocaleString("en-IN")}</p><p>Approved identity: {permission.proposal?.company_name}</p><p>{permission.proposal?.professional_details}</p>
      {permission.proposal?.logo_asset_id && <Image src={`/api/branding/logo/${permission.proposal.logo_asset_id}?account=${selectedAccountId()}`} alt="Permission approved logo" width={96} height={96} unoptimized />}
      <button disabled={busy} onClick={()=>{ void act({ action:"apply",permissionId:permission.id }); }} className="mt-3 rounded bg-blue-700 px-4 py-2 text-white">Apply approved changes</button>
    </section>)}
    {!!profile?.requests.length && <section className="space-y-3"><h2 className="text-xl font-semibold">Requests and decisions</h2>{profile.requests.map((request)=><article key={request.id} className="rounded border p-4"><p>{request.company_name} — {request.status}</p><p>{request.decision_reason}</p>{request.status==="needs_information" && <form onSubmit={(event)=>{ event.preventDefault();const form=new FormData(event.currentTarget);void act({ action:"information",requestId:request.id,message:form.get("message") }); }}><label>Additional information<textarea name="message" required maxLength={2000} className="block w-full border p-2" /></label><button disabled={busy} className="text-blue-700">Supply information</button></form>}</article>)}</section>}
    {!!profile?.versions.length && <section className="space-y-3"><h2 className="text-xl font-semibold">Immutable branding history</h2>{profile.versions.map((version)=><article key={version.id} className="rounded border p-4"><p>{version.company_name}</p><p>{version.professional_details}</p><p className="text-sm">{new Date(version.created_at).toLocaleString("en-IN")} · {version.approved_by ? `Approved by ${version.approved_by}` : "Initial identity baseline"} · user {version.created_by || "Baseline"} · {version.logo_asset_id ? "Logo version retained" : "No logo"}</p></article>)}</section>}
    {!!profile?.audit.length && <section><h2 className="text-xl font-semibold">Approval and permission audit</h2>{profile.audit.map((event)=><p key={event.id} className="mt-2 text-sm">{event.action} · {event.actor_id} · {new Date(event.occurred_at).toLocaleString("en-IN")}</p>)}</section>}
  </div></main>;
}
