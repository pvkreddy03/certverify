"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { supabase } from "@/lib/supabase";

type Cover = {
  id: string; name: string; file_name: string; file_type: string; created_at: string;
  template_id: string | null; report_format_id: string | null; is_default: boolean;
};
type Named = { id: string; name?: string; format_name?: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to load cover-letter formats.";

export default function MyCoverLettersPage() {
  const [covers, setCovers] = useState<Cover[]>([]);
  const [templates, setTemplates] = useState<Named[]>([]);
  const [reports, setReports] = useState<Named[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [renameId, setRenameId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in to view your cover-letter formats.");
    const account = requireSelectedAccountId();
    const [heads, tmpl, fmts, member] = await Promise.all([
      supabase.from("cv_cover_letter_templates")
        .select("id,name,file_name,file_type,created_at,template_id,report_format_id,is_default")
        .eq("account_id", account).order("name"),
      supabase.from("certificate_templates").select("id,name").eq("account_id",account),
      supabase.from("cv_report_format_library").select("id,format_name").eq("account_id",account),
      supabase.from("account_members").select("role").eq("account_id",account).eq("user_id",user.id).eq("status","active").maybeSingle(),
    ]);
    if (heads.error) throw new Error("Unable to open cover formats: " + heads.error.message);
    if (tmpl.error || fmts.error) throw new Error("Unable to load linked formats.");
    if (!member.data) throw new Error("Select an active organization.");
    setCovers((heads.data ?? []) as Cover[]);
    setTemplates((tmpl.data ?? []) as Named[]);
    setReports((fmts.data ?? []) as Named[]);
    setCanManage(["owner","admin"].includes(member.data.role));
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load).catch(error => {
      if (active) setMessage(errorText(error));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  const templateNames = useMemo(() => new Map(templates.map(item=>[item.id,item.name])),[templates]);
  const reportNames = useMemo(() => new Map(reports.map(item=>[item.id,item.format_name])),[reports]);
  const term = query.trim().toLowerCase();
  const matching = covers.filter(item =>
    [item.name,templateNames.get(item.template_id??"")??"",reportNames.get(item.report_format_id??"")??""]
      .some(value => (value??"").toLowerCase().includes(term)));

  async function renameCover(item: Cover) {
    if (!canManage || busyId) return;
    const clean = renameValue.trim();
    if (clean.length < 2 || clean.length > 100) { setMessage("Enter a format name between 2 and 100 characters."); return; }
    setBusyId(item.id); setMessage("");
    try {
      const {data,error} = await supabase.from("cv_cover_letter_templates")
        .update({name:clean}).eq("id",item.id).eq("account_id",requireSelectedAccountId())
        .select("id,name").single();
      if (error || !data) throw new Error(error?.message ?? "You cannot rename this format.");
      setCovers(previous=>previous.map(row=>row.id===item.id?{...row,name:data.name}:row));
      setRenameId(""); setMessage("Cover-letter format renamed.");
    } catch(error) { setMessage(errorText(error)); }
    finally { setBusyId(""); }
  }

  async function makeDefault(item: Cover) {
    if (!canManage || busyId || item.template_id || item.report_format_id) return;
    setBusyId(item.id); setMessage("");
    try {
      const { error } = await supabase.rpc("cv_choose_default_letterhead", {p_letterhead:item.id});
      if (error) throw new Error(error.message);
      setCovers(previous => previous.map(row=>({...row,is_default:row.id===item.id})));
      setMessage("Default letterhead updated. All ordinary certificate downloads will use this QR placement.");
    } catch(error) { setMessage(errorText(error)); }
    finally { setBusyId(""); }
  }

  return <main className="cv-page">
    <div className="cv-shell space-y-5 pb-14">
      <Link href="/dashboard" className="text-sm font-semibold text-teal-800 underline">← Dashboard</Link>
      <header className="cv-hero"><div className="cv-hero__body flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="cv-eyebrow mb-2">SAVED REUSABLE FORMATS</p>
          <h1 className="text-3xl font-extrabold !text-white">My Cover Letters</h1>
          <p className="mt-2 text-sm text-[#d2e5ec]">Your default plain letterhead and QR position apply to every certificate. Optional specialized cover formats can be added for templates or reports.</p>
        </div>
        {canManage && <Link href="/dashboard/cover-letters"
          className="cv-primary !border-[#35bea9] !bg-[#47d5c2] !text-[#082b35]">+ Create Cover Letter Format</Link>}
      </div></header>
      {message && <p role="status" className="rounded-xl border border-teal-200 bg-white p-4 text-sm text-[#215565]">{message}</p>}
      <label className="block text-sm font-semibold text-[#285061]">Search formats
        <input type="search" aria-label="Search cover formats" className="cv-field mt-2" value={query}
          onChange={e=>setQuery(e.target.value)} placeholder="Format name, certificate template or Word report"/>
      </label>
      {loading ? <p role="status" className="cv-panel rounded-xl p-6">Loading cover formats…</p> :
        <section className="cv-panel rounded-2xl p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-[#173b4b]">Reusable cover-letter formats ({matching.length})</h2>
          <p className="mt-1 text-xs text-slate-500">Use Set as default on your usual plain letterhead. Other formats are optional; downloaded covers and reports are not stored.</p>
          {matching.length===0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
            <p className="text-sm font-semibold text-slate-600">{covers.length ? "No formats match your search." : "No reusable cover-letter formats saved yet."}</p>
            {canManage && !covers.length && <Link href="/dashboard/cover-letters"
              className="mt-3 inline-block text-sm font-semibold text-teal-800 underline">Create your first format</Link>}
          </div> : <div className="mt-4 space-y-3">
            {matching.map(item => <article key={item.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-[#d9e7e9] bg-white p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f8f3] text-teal-700">
                <svg width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" aria-hidden="true">
                  <path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7M9 16h7"/>
                </svg>
              </span>
              <div className="min-w-[190px] flex-1">
                {item.is_default && <p className="mb-1 text-xs font-bold text-teal-700">✓ Default letterhead for all certificates</p>}
                {renameId===item.id ? <div className="flex flex-wrap items-center gap-2">
                  <input aria-label="Rename cover format" className="cv-field !w-auto min-w-[190px] flex-1" maxLength={100}
                    value={renameValue} onChange={e=>setRenameValue(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")void renameCover(item);if(e.key==="Escape")setRenameId("");}}/>
                  <button type="button" className="cv-primary" disabled={!!busyId} onClick={()=>void renameCover(item)}>Save name</button>
                  <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={()=>setRenameId("")}>Cancel</button>
                </div> : <p className="font-extrabold text-[#1b4052]">{item.name}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {item.template_id ? "Template: "+(templateNames.get(item.template_id)??"Unavailable") : "All certificate templates"}
                  {" · "}
                  {item.report_format_id ? "Report: "+(reportNames.get(item.report_format_id)??"Unavailable") : "Any compatible report"}
                  {" · "}{item.file_type.includes("pdf") ? "PDF" : item.file_type.includes("word") ? "Word" : "Image"}
                </p>
              </div>
              {canManage && !item.is_default && !item.template_id && !item.report_format_id &&
                <button type="button" disabled={!!busyId} onClick={()=>void makeDefault(item)}
                  className="rounded-xl border border-teal-700 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-900 disabled:opacity-50">
                  Set as default
                </button>}
              {canManage && renameId!==item.id && <button type="button" className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold"
                onClick={()=>{setRenameId(item.id);setRenameValue(item.name);}}>Rename</button>}
              {canManage && <Link href={"/dashboard/cover-letters?letterhead="+item.id} className="rounded-xl border border-teal-700 px-4 py-2.5 text-sm font-bold text-teal-800">Edit format</Link>}
            </article>)}
          </div>}
          <Link href="/dashboard/certificates/list" className="mt-5 inline-block text-sm font-semibold text-teal-800 underline">
            Go to My Certificates to download covers
          </Link>
        </section>}
    </div>
  </main>;
}
