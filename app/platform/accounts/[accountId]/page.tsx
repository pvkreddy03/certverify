"use client";
import { use,useEffect,useState } from "react";
import { PlatformAdminGuide } from "@/components/platform-admin-guide";
import Link from "next/link";
import { PlatformMfa } from "@/components/platform-mfa";
import { platformFetch } from "@/lib/platform/client";
import { supabase } from "@/lib/supabase";
import { ACCESS_STATUSES,type AccountDetail,type AccessStatus } from "@/lib/platform/types";
type ContactProfile = {
  user_id: string; role: string; status: string; login_email: string | null;
  display_name: string; contact_email: string | null; mobile: string | null;
  job_title: string | null; city: string | null; bio: string | null;
  avatar_path: string | null;
};
function Account({ id }: {id:string}) {
  const [detail,setDetail]=useState<AccountDetail|null>(null);const [target,setTarget]=useState<AccessStatus>("suspended");const [reason,setReason]=useState("");
  const [error,setError]=useState("");const [message,setMessage]=useState("");const [confirm,setConfirm]=useState(false);const [busy,setBusy]=useState(false);
  const [contactProfiles, setContactProfiles] = useState<ContactProfile[]>([]);
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string>>({});
  const [profileError, setProfileError] = useState("");
  useEffect(() => {
    let live = true;
    void platformFetch<{ profiles: ContactProfile[] }>(`/api/platform/accounts/${id}/profiles`)
      .then(async result => {
        if (!live) return;
        setContactProfiles(result.profiles ?? []);
        const photos: Record<string, string> = {};
        for (const profile of result.profiles ?? []) {
          if (!profile.avatar_path) continue;
          const signed = await supabase.storage.from("certverify-user-avatars")
            .createSignedUrl(profile.avatar_path, 600);
          if (signed.data?.signedUrl) photos[profile.user_id] = signed.data.signedUrl;
        }
        if (live) setProfilePhotos(photos);
      })
      .catch(failure => { if (live) setProfileError(failure instanceof Error ? failure.message : "Profile information is unavailable."); });
    return () => { live = false; };
  }, [id]);
  useEffect(()=>{let active=true;void platformFetch<AccountDetail>(`/api/platform/accounts/${id}`).then((data)=>{if(active)setDetail(data);}).catch((failure)=>{if(active)setError(failure.message);});return()=>{active=false;};},[id]);
  async function load(page=1) { setBusy(true);setError("");try{setDetail(await platformFetch<AccountDetail>(`/api/platform/accounts/${id}?memberPage=${page}`));}catch(failure){setError(failure instanceof Error ? failure.message : "Account details could not be loaded.");}finally{setBusy(false);}}
  async function change() {
    if(!detail) return;setBusy(true);setError("");setMessage("");
    try{await platformFetch(`/api/platform/accounts/${id}/access`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:target,reason,revision:detail.access.revision})});setDetail(await platformFetch<AccountDetail>(`/api/platform/accounts/${id}`));setConfirm(false);setReason("");setMessage("Account access updated and audit evidence recorded.");}
    catch(failure){setError(failure instanceof Error ? failure.message : "Access change failed.");}finally{setBusy(false);}
  }
  return <div className="space-y-6">{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{!detail && !error && <p>Loading account details…</p>}{detail && <>
    <section className="space-y-2 rounded border bg-white p-6"><h2 className="text-2xl font-semibold">{detail.account.name}</h2><p>{detail.account.account_type} · {detail.account.account_code}</p><p>Access: <strong>{detail.access.status}</strong></p><p>Last decision: {detail.access.reason || "Initial activation"}</p><p className="text-sm">{new Date(detail.access.changed_at).toLocaleString("en-IN")} · administrator {detail.access.changed_by || "Initial baseline"}</p><p>Subscription: {detail.subscription?.status || "unknown"}</p>{detail.subscription && <p className="text-sm">Source: {detail.subscription.source}. Observed {new Date(detail.subscription.observed_at).toLocaleString("en-IN")}.</p>}
      <p>Certificates: {detail.account.certificate_count} total · {detail.account.active_certificates} Active · {detail.account.inactive_certificates} Inactive · {detail.account.revoked_certificates} Revoked</p><p>Last issuance: {detail.account.last_issued_at ? new Date(detail.account.last_issued_at).toLocaleString("en-IN") : "No certificates issued"}</p>
    </section>
    <form className="space-y-4 rounded border bg-white p-6" onSubmit={(event)=>{event.preventDefault();if(!reason.trim()){setError("A reason is required.");return;}setConfirm(true);}}><h2 className="text-xl font-semibold">Manage account access</h2><p>Suspension or deactivation blocks customer operations. Previously issued certificates remain publicly verifiable. Restoration preserves memberships and history.</p>
      <label className="block">New access status<select value={target} onChange={(event)=>{setTarget(event.target.value as AccessStatus);setConfirm(false);}} disabled={busy || confirm} className="ml-3 rounded border p-2">{ACCESS_STATUSES.map((value)=><option key={value} value={value}>{value==="active" ? "Active — activate or restore" : value}</option>)}</select></label>
      <label className="block">Mandatory reason<textarea required maxLength={2000} disabled={busy || confirm} value={reason} onChange={(event)=>setReason(event.target.value)} className="mt-2 block w-full rounded border p-3" /></label>
      {!confirm ? <button disabled={busy || target===detail.access.status} className="rounded bg-blue-700 px-4 py-2 text-white">Review access change</button> : <div role="group" aria-label="Confirm account access change"><p>Change {detail.account.name} from {detail.access.status} to {target}?</p><button type="button" disabled={busy} onClick={()=>{void change();}} className="mt-3 rounded bg-red-700 px-4 py-2 text-white">Confirm access change</button><button type="button" disabled={busy} onClick={()=>setConfirm(false)} className="ml-4 rounded border px-4 py-2">Cancel</button></div>}
      <button type="button" disabled={busy} onClick={()=>{setConfirm(false);void load(detail.member_page);}} className="ml-4 rounded border px-4 py-2">Refresh account</button>
    </form>
    <section className="rounded border bg-white p-6"><h2 className="text-xl font-semibold">Organization and account memberships</h2><p>{detail.total_members} membership records, including removed access.</p><div className="mt-4 overflow-x-auto"><table className="w-full text-left"><thead><tr><th>Email</th><th>Role</th><th>Access</th><th>Email verified</th></tr></thead><tbody>{detail.members.map((member)=><tr key={member.id}><td className="border-b py-3">{member.email || "Unavailable"}</td><td>{member.role}</td><td>{member.status}</td><td>{member.email_confirmed_at ? "Yes" : "No"}</td></tr>)}</tbody></table></div><div className="mt-4 flex gap-4"><button disabled={busy || detail.member_page===1} onClick={()=>{void load(detail.member_page-1);}}>Previous members</button><span>Page {detail.member_page}</span><button disabled={busy || detail.member_page*50>=detail.total_members} onClick={()=>{void load(detail.member_page+1);}}>Next members</button></div></section>
    <section className="rounded-2xl border border-[#d8e8e9] bg-white p-6">
      <h2 className="text-xl font-extrabold text-[#1b3849]">User profiles and contact details</h2>
      <p className="mt-1 text-xs leading-5 text-slate-600">Private information supplied by customers for support. Visible only to MFA-verified CertVerify platform administrators. Contact email does not change their login.</p>
      {profileError && <p role="alert" className="mt-3 text-sm text-amber-800">{profileError}</p>}
      {contactProfiles.length === 0 ? <p className="mt-4 text-sm text-slate-500">No user profiles are available for this account yet.</p>
        : <div className="mt-5 grid gap-4 sm:grid-cols-2">{contactProfiles.map(profile =>
          <article key={profile.user_id} className="rounded-xl border border-[#e0e9ed] p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e1f6ee] bg-cover bg-center text-sm font-bold text-[#0b7268]"
                role="img" aria-label="User profile photo" style={profilePhotos[profile.user_id] ? { backgroundImage: 'url("' + profilePhotos[profile.user_id] + '")' } : undefined}>
                {profilePhotos[profile.user_id] ? "" : (profile.display_name || profile.login_email || "U").slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1"><p className="font-bold text-[#1d4051]">{profile.display_name || "Profile not completed"}</p>
                <p className="text-xs text-slate-500">{profile.role} · {profile.status}</p></div>
            </div>
            <dl className="mt-4 space-y-2 break-all text-sm">
              <div><dt className="font-semibold text-[#33576b]">Login email</dt><dd>{profile.login_email || "—"}</dd></div>
              <div><dt className="font-semibold text-[#33576b]">Contact email</dt><dd>{profile.contact_email || "Not supplied"}</dd></div>
              <div><dt className="font-semibold text-[#33576b]">Phone</dt><dd>{profile.mobile || "Not supplied"}</dd></div>
              <div><dt className="font-semibold text-[#33576b]">Profession</dt><dd>{profile.job_title || "—"}</dd></div>
              <div><dt className="font-semibold text-[#33576b]">City</dt><dd>{profile.city || "—"}</dd></div>
              {profile.bio && <div><dt className="font-semibold text-[#33576b]">About</dt><dd className="whitespace-pre-wrap">{profile.bio}</dd></div>}
            </dl>
          </article>)}</div>}
    </section>
    <section className="rounded border bg-white p-6"><h2 className="text-xl font-semibold">Recent account activity</h2><p className="text-sm">Latest 50 audited actions. Private certificate fields and internal revocation reasons are excluded.</p>{detail.activity.map((event)=><p key={event.id} className="mt-3 text-sm">{event.action} · {new Date(event.occurred_at).toLocaleString("en-IN")} · actor {event.actor_id}</p>)}</section>
    <Link className="mr-5 text-blue-700" href={`/platform/subscriptions?account=${id}`}>Manage subscription and quotas</Link><Link className="text-blue-700" href={`/platform/audit?account=${id}`}>View immutable administrative history</Link>
  </>}</div>;
}
export default function PlatformAccountPage({params}:{params:Promise<{accountId:string}>}){const {accountId}=use(params);return <main className="mx-auto max-w-5xl space-y-6 px-6 py-8"><h1 className="text-3xl font-bold">Account inspection</h1><PlatformAdminGuide section="account" /><PlatformMfa><Account id={accountId} /></PlatformMfa></main>;}
