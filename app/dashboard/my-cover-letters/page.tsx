"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { downloadSavedCover, triggerPdfDownload } from "@/lib/cover-letters/saved-covers";

type SavedLetter = {
  id: string; name: string; certificate_id: string; letterhead_id: string; pdf_storage_path: string;
  output_mode: "qr" | "manual" | "auto"; includes_report: boolean; created_by: string; created_at: string;
};
type Letterhead = { id: string; name: string; file_type: string; created_at: string };
type Certificate = { id: string; certificate_id: string };

function describeMode(mode: SavedLetter["output_mode"]) {
  return mode === "qr" ? "QR only" : mode === "auto" ? "Auto-filled" : "Manual letter";
}
function errorText(error: unknown) { return error instanceof Error ? error.message : "Please try again."; }

export default function MyCoverLettersPage() {
  const [letters, setLetters] = useState<SavedLetter[]>([]);
  const [letterheads, setLetterheads] = useState<Letterhead[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [userId, setUserId] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in to view your cover letters.");
    const accountId = requireSelectedAccountId();
    const [stored, heads, certs, member] = await Promise.all([
      supabase.from("cv_saved_cover_letters").select("id,name,certificate_id,letterhead_id,pdf_storage_path,output_mode,includes_report,created_by,created_at")
        .eq("account_id", accountId).order("created_at", {ascending:false}).limit(500),
      supabase.from("cv_cover_letter_templates").select("id,name,file_type,created_at").eq("account_id", accountId).order("name"),
      supabase.from("certificates").select("id,certificate_id").eq("account_id",accountId).limit(750),
      supabase.from("account_members").select("role").eq("account_id",accountId).eq("user_id",user.id).eq("status","active").maybeSingle(),
    ]);
    if (stored.error) throw new Error("My Cover Letters is not available: " + stored.error.message);
    if (heads.error || certs.error) throw new Error("Couldn't load letterhead or certificate names.");
    if (!member.data) throw new Error("Choose an active organization.");
    setLetters((stored.data ?? []) as SavedLetter[]);
    setLetterheads((heads.data ?? []) as Letterhead[]);
    setCertificates((certs.data ?? []) as Certificate[]);
    setUserId(user.id);
    setCanManage(["owner","admin"].includes(member.data.role));
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(load).catch(error => {
      if (active) setMessage(errorText(error));
    }).finally(() => { if (active) setLoading(false); });
    return () => {active = false;};
  }, [load]);

  const certificateNames = useMemo(() => new Map(certificates.map(cert => [cert.id, cert.certificate_id])), [certificates]);
  const search = query.trim().toLowerCase();
  const matchedLetters = letters.filter(item =>
    [item.name, certificateNames.get(item.certificate_id) ?? "", describeMode(item.output_mode)]
      .some(text => text.toLowerCase().includes(search)));
  const matchedLetterheads = letterheads.filter(item => item.name.toLowerCase().includes(search));

  async function download(item: SavedLetter) {
    if (busyId) return;
    setBusyId(item.id); setMessage("");
    try {
      const pdf = await downloadSavedCover(item.pdf_storage_path);
      triggerPdfDownload(pdf, item.name);
      setMessage("Downloaded " + item.name + ".");
    } catch (error) { setMessage(errorText(error)); }
    finally { setBusyId(""); }
  }
  function startRename(item: SavedLetter) {
    setRenamingId(item.id); setNewName(item.name); setMessage("");
  }
  async function saveName(item: SavedLetter) {
    const clean = newName.trim();
    if (clean.length < 2 || clean.length > 120) { setMessage("Enter a cover letter name between 2 and 120 characters."); return; }
    if (busyId) return;
    setBusyId(item.id); setMessage("");
    try {
      const { data, error } = await supabase.from("cv_saved_cover_letters").update({name:clean}).eq("id",item.id)
        .select("id,name").single();
      if (error || !data) throw new Error(error?.message ?? "You do not have permission to rename this letter.");
      setLetters(previous => previous.map(row => row.id === item.id ? {...row,name:data.name} : row));
      setRenamingId(""); setMessage("Cover letter renamed.");
    } catch(error) { setMessage(errorText(error)); }
    finally { setBusyId(""); }
  }

  return <main className="cv-page">
    <div className="cv-shell space-y-5 pb-14">
      <Link href="/dashboard" className="text-sm font-semibold text-teal-800 underline">← Dashboard</Link>
      <header className="cv-hero">
        <div className="cv-hero__body flex flex-wrap items-center justify-between gap-4">
          <div><p className="cv-eyebrow mb-2">YOUR DOCUMENT LIBRARY</p>
            <h1 className="text-3xl font-extrabold !text-white">My Cover Letters</h1>
            <p className="mt-2 text-sm text-[#d2e5ec]">Find, rename and download your saved PDF cover letters. Reuse your saved letterheads whenever you need a new one.</p>
          </div>
          <Link href="/dashboard/cover-letters" className="cv-primary !border-[#35bea9] !bg-[#47d5c2] !text-[#082b35]">+ Create Cover Letter</Link>
        </div>
      </header>
      {message && <p role="status" className="rounded-xl border border-[#acd9d4] bg-white p-4 text-sm font-semibold text-[#20495a]">{message}</p>}
      <label className="block text-sm font-semibold text-[#285061]">Search cover letters or letterheads
        <input aria-label="Search cover letters" type="search" className="cv-field mt-2" value={query}
          onChange={e => setQuery(e.target.value)} placeholder="Name, certificate number or type"/>
      </label>
      {loading ? <p role="status" className="cv-panel rounded-xl p-6">Loading your cover letters…</p> : <>
        <section className="cv-panel rounded-2xl p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-[#173b4b]">Saved cover letters <span className="ml-1 text-sm font-semibold text-slate-500">({matchedLetters.length})</span></h2>
          <p className="mt-1 text-xs text-slate-500">Saved as finished PDFs. Downloading again returns the same document, even if the original letterhead or certificate changes.</p>
          {matchedLetters.length===0 ? <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-[#f8fafb] px-5 py-7 text-center">
            <p className="text-sm font-semibold text-slate-600">{letters.length ? "No cover letters match your search." : "No cover letters saved yet."}</p>
            {!letters.length && <Link href="/dashboard/cover-letters" className="mt-2 inline-block text-sm font-semibold text-teal-800 underline">Create your first cover letter</Link>}
          </div> : <div className="mt-4 space-y-3">
            {matchedLetters.map(item => <article key={item.id} className="rounded-xl border border-[#d9e7e9] bg-white p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e9f8f3] text-teal-700">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 2h8l5 5v15H6zM14 2v6h5M9 12h7M9 16h7"/></svg>
                </div>
                <div className="min-w-[200px] flex-1">
                  {renamingId===item.id ? <div className="flex flex-wrap items-center gap-2">
                    <input aria-label="Rename cover letter" className="cv-field !w-auto min-w-[190px] flex-1"
                      value={newName} maxLength={120} onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => {if(e.key==="Enter")void saveName(item); if(e.key==="Escape")setRenamingId("");}}/>
                    <button type="button" className="cv-primary" onClick={()=>void saveName(item)} disabled={!!busyId}>Save name</button>
                    <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={()=>setRenamingId("")}>Cancel</button>
                  </div> : <p className="font-extrabold text-[#1b4052]">{item.name}</p>}
                  <p className="mt-1 text-xs text-slate-500">{certificateNames.get(item.certificate_id) ?? "Certificate"}
                    {" · "}{describeMode(item.output_mode)}{item.includes_report ? " · With report" : ""}
                    {" · "}{new Date(item.created_at).toLocaleDateString("en-IN")}
                  </p>
                </div>
                {renamingId!==item.id && (canManage || item.created_by===userId) &&
                  <button type="button" className="rounded-xl border border-[#cbdadf] px-4 py-2 text-sm font-semibold text-[#235165]" onClick={()=>startRename(item)}>Rename</button>}
                <button type="button" className="cv-primary disabled:opacity-50" disabled={!!busyId} onClick={()=>void download(item)}>
                  {busyId===item.id ? "Downloading…" : "Download PDF"}
                </button>
              </div>
            </article>)}
          </div>}
        </section>

        <section id="letterheads" className="cv-panel rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-extrabold text-[#173b4b]">Reusable letterheads <span className="ml-1 text-sm font-semibold text-slate-500">({matchedLetterheads.length})</span></h2>
              <p className="mt-1 text-xs text-slate-500">Original PDF, Word or image templates with saved QR positions.</p></div>
            {canManage && <Link href="/dashboard/cover-letters" className="rounded-xl border border-teal-700 px-4 py-2.5 text-sm font-semibold text-teal-800">+ Add Letterhead</Link>}
          </div>
          {matchedLetterheads.length===0 ? <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-[#f8fafb] px-5 py-6 text-sm text-slate-500">
            {letterheads.length ? "No letterheads match your search." : "No letterheads saved yet. Upload one to reuse it for future letters."}
          </p> : <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {matchedLetterheads.map(head=><div key={head.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#d9e7e9] p-4">
              <div className="min-w-0 flex-1"><p className="truncate font-bold text-[#1b4052]">{head.name}</p>
                <p className="mt-1 text-xs text-slate-500">{head.file_type.includes("pdf") ? "PDF" : head.file_type.includes("word") ? "Word" : "Image"} letterhead</p></div>
              <Link href={"/dashboard/cover-letters?letterhead="+head.id} className="rounded-lg bg-teal-800 px-4 py-2.5 text-xs font-bold text-white">Use / Edit</Link>
            </div>)}
          </div>}
        </section>
      </>}
    </div>
  </main>;
}
