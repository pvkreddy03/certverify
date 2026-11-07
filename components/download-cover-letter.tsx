"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { supabase } from "@/lib/supabase";
import { DEFAULT_PLACEMENT, fillCoverText, savePdf, type CoverPlacement } from "@/lib/cover-letters/generator";
import { createPrintableDocument, detectKind } from "@/lib/cover-letters/native-documents";
import { downloadLetterhead } from "@/lib/cover-letters/private-storage";
import { downloadWordOriginal } from "@/lib/reports/private-storage";
import { generateWordReport, openWordDocument, type ReportBinding } from "@/lib/reports/docx-visual";
import { matchingCoverFormats } from "@/lib/cover-letters/format-options";
import { createWordCoverLetter, downloadWordCover, plainLetterheadPdf } from "@/lib/cover-letters/word-cover";
import { DownloadWordReport } from "@/components/download-word-report";

type CoverFormat = CoverPlacement & {
  id: string; name: string; file_name: string; file_type: string;
  storage_path: string; body_template: string;
  template_id: string | null; report_format_id: string | null; is_default?: boolean;
};
type WordFormat = {
  id: string; format_name: string; template_id: string;
  storage_path: string; bindings: ReportBinding[];
};
type Field = { field_name: string; field_value: string | null };
type Props = {
  certificateNumber: string;
  certificateCreatedAt: string;
  verificationId: string;
  templateId: string | null;
  preferredReportId: string | null;
  preferredCoverId: string | null;
  fieldValues: Field[];
};
type DocumentChoice = "letterhead" | "cover" | "report";
type DocumentFormat = "pdf" | "docx";

/** Three clear workflows instead of a combined cover/report settings form.
 * A normal valuer can download the first option without configuring anything.
 * Unusual format choices remain inside the optional settings disclosure.
 */
export function DownloadCoverLetter({
  certificateNumber, certificateCreatedAt, verificationId, templateId, preferredReportId, preferredCoverId, fieldValues,
}: Props) {
  const [covers, setCovers] = useState<CoverFormat[]>([]);
  const [reports, setReports] = useState<WordFormat[]>([]);
  const [coverId, setCoverId] = useState("");
  const [reportId, setReportId] = useState("");
  const [manualText, setManualText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<DocumentChoice | null>(null);
  const [message, setMessage] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    let live = true;
    async function load() {
      const accountId = requireSelectedAccountId();
      const [{data:{user}}, {data:coverData,error:coverError}, {data:reportData,error:reportError}] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("cv_cover_letter_templates")
          .select("id,name,file_name,file_type,storage_path,body_template,template_id,report_format_id,is_default,qr_x,qr_y,qr_size,text_x,text_y,text_width,text_height")
          .eq("account_id",accountId).order("name"),
        supabase.from("cv_report_format_library")
          .select("id,format_name,template_id,storage_path,bindings")
          .eq("account_id",accountId).order("format_name"),
      ]);
      if (!user) throw new Error("Sign in to download the document.");
      if (coverError) throw new Error("Could not load your saved letterheads. " + coverError.message);
      if (reportError) throw new Error("Could not load your report formats. " + reportError.message);
      if (!live) return;
      const matched=((reportData??[]) as WordFormat[]).filter(item=>item.template_id===templateId);
      setCovers((coverData??[]) as CoverFormat[]);
      setReports(matched);
      setReportId(matched.find(item=>item.id===preferredReportId)?.id??matched[0]?.id??"");
    }
    void load().catch(error=>{
      if(live)setMessage(error instanceof Error ? error.message : "Documents could not be loaded.");
    }).finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[templateId,preferredReportId]);

  useEffect(()=>()=>{if(resultUrl)URL.revokeObjectURL(resultUrl);},[resultUrl]);

  const matchingCovers=useMemo(()=>matchingCoverFormats(covers,templateId,reportId||null),
    [covers,templateId,reportId]);
  const firstAvailable=matchingCovers.find(item=>item.is_default)??matchingCovers[0];
  const defaultHead=covers.find(item=>item.is_default && !item.template_id && !item.report_format_id)
    ??covers.find(item=>!item.template_id && !item.report_format_id)
    ??firstAvailable;
  const chosenCover=matchingCovers.find(item=>item.id===coverId)
    ??matchingCovers.find(item=>item.id===preferredCoverId)
    ??defaultHead??firstAvailable;
  const selectedReport=reports.find(item=>item.id===reportId)??reports[0]??null;
  const values=useMemo(()=>{
    const output:Record<string,string>={};
    fieldValues.forEach(item=>{output[item.field_name]=item.field_value??"";});
    output["Certificate Number"]=certificateNumber;
    output["Certificate Date"]=output["Certificate Date"]||
      new Date(certificateCreatedAt).toLocaleDateString("en-IN");
    output["Date"]=new Date().toLocaleDateString("en-IN");
    return output;
  },[fieldValues,certificateNumber,certificateCreatedAt]);
  const prefilled=chosenCover ? fillCoverText(chosenCover.body_template??"",values) : "";
  const currentText=manualText??prefilled;

  async function download(choice:DocumentChoice,format:DocumentFormat) {
    // A synchronous guard prevents even two rapid click events in one React render.
    if(lock.current||loading)return;
    lock.current=true;
    setWorking(choice);
    setMessage("");
    try {
      if(choice==="report" && !selectedReport)
        throw new Error("No valuation report format is linked. Set up a report format first.");
      const selectedHead=choice==="cover" ? chosenCover : defaultHead;
      const original=selectedHead ? await downloadLetterhead(selectedHead.storage_path) : null;
      const kind=selectedHead ? detectKind({name:selectedHead.file_name,type:selectedHead.file_type}) : null;
      const placement:CoverPlacement=selectedHead
        ? {qr_x:selectedHead.qr_x,qr_y:selectedHead.qr_y,qr_size:selectedHead.qr_size,
           text_x:selectedHead.text_x,text_y:selectedHead.text_y,
           text_width:selectedHead.text_width,text_height:selectedHead.text_height}
        : DEFAULT_PLACEMENT;
      const text=choice==="cover" ? currentText : "";
      const prefix=choice==="letterhead" ? "Letterhead QR - " :
        choice==="cover" ? "Cover Letter - " : "Valuation Report with Letterhead - ";

      if(format==="docx") {
        // Editable Word covers consist of the original first-page letterhead
        // and the QR; no screenshot of the full report is mistaken for Word.
        const word=await createWordCoverLetter({
          background:original,kind,verificationId,body:text,placement,
        });
        downloadWordCover(word,prefix+certificateNumber+".docx");
        setMessage(choice==="letterhead"
          ? "Your editable Word letterhead with QR has downloaded."
          : "Your editable Word cover letter has downloaded.");
        return;
      }

      let report:Blob|null=null;
      if(choice==="report" && selectedReport) {
        const bindings=Array.isArray(selectedReport.bindings)?selectedReport.bindings:[];
        const missing=[...new Set(bindings.map(item=>item.fieldName).filter(name=>!(name in values)))];
        if(missing.length)throw new Error("Report is missing mapped fields: "+missing.join(", "));
        const word=await openWordDocument(await downloadWordOriginal(selectedReport.storage_path));
        report=await generateWordReport(word,bindings,values);
      }
      const pdf=await createPrintableDocument({
        background:original??await plainLetterheadPdf(), kind:kind??"pdf",
        verificationId,body:text,placement,report,
      });
      if(resultUrl)URL.revokeObjectURL(resultUrl);
      setResultUrl(URL.createObjectURL(pdf));
      savePdf(pdf,prefix+certificateNumber);
      setMessage(choice==="report" ? "Downloaded: letterhead and QR first, valuation report on the following pages."
        : choice==="letterhead" ? "Downloaded: your plain letterhead with its verification QR."
        : "Downloaded: your cover letter with its verification QR.");
    } catch(error) {
      setMessage(error instanceof Error ? error.message : "Download failed. Please try again.");
    } finally {
      lock.current=false;
      setWorking(null);
    }
  }

  const mainButton="min-h-14 w-full rounded-xl bg-[#0e7f73] px-5 py-3 text-left text-base font-bold text-white shadow-sm transition-colors hover:bg-[#08685f] disabled:cursor-wait disabled:opacity-60";
  const otherButton="inline-flex min-h-11 items-center text-sm font-bold text-teal-800 underline underline-offset-4 disabled:opacity-60";
  const busy=working!==null;
  return <section aria-label="Download Cover Letter" className="space-y-5" id="download-documents">
    <div>
      <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Download documents</h2>
      <p className="mt-1 text-base text-slate-600">Choose what you want. Letterhead + QR is ready in one click.</p>
    </div>
    {loading ? <p role="status" className="rounded-xl border bg-white p-6 text-base">Preparing your download options…</p> :
    <div className="grid gap-4 lg:grid-cols-3">
      <article className="flex flex-col rounded-2xl border-2 border-teal-500 bg-white p-5 shadow-sm">
        <div className="mb-5 flex-1">
          <span className="text-sm font-bold text-teal-800">1 · Most commonly used</span>
          <h3 className="mt-2 text-xl font-extrabold text-slate-900">Letterhead + QR</h3>
          <p className="mt-2 text-base leading-relaxed text-slate-600">Your plain letterhead with the verification QR in its saved position. No extra text.</p>
        </div>
        <button className={mainButton} type="button" disabled={busy}
          onClick={()=>void download("letterhead","pdf")}>
          {working==="letterhead"?"Preparing PDF…":"Download Letterhead + QR"}
          <span className="mt-1 block text-xs font-medium text-white/85">PDF · ready to print</span>
        </button>
        <button className={otherButton+" mt-2"} type="button" disabled={busy}
          onClick={()=>void download("letterhead","docx")}>Need editable Word instead?</button>
      </article>

      <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex-1">
          <span className="text-sm font-semibold text-slate-500">2 · When a letter is needed</span>
          <h3 className="mt-2 text-xl font-extrabold text-slate-900">Cover Letter</h3>
          <p className="mt-2 text-base leading-relaxed text-slate-600">Letterhead and QR with your standard or edited letter text.</p>
          <details className="mt-4 rounded-lg bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-bold text-teal-800">Edit the letter text</summary>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Cover-letter wording
              <textarea aria-label="Letter text" className="cv-field mt-2 min-h-32"
                value={currentText} onChange={event=>setManualText(event.target.value)}
                placeholder="Type your letter. Leave blank for just the letterhead and QR."/>
            </label>
          </details>
        </div>
        <button className={mainButton} type="button" disabled={busy}
          onClick={()=>void download("cover","pdf")}>
          {working==="cover"?"Preparing PDF…":"Download Cover Letter"}
          <span className="mt-1 block text-xs font-medium text-white/85">PDF · letter and QR</span>
        </button>
        <button type="button" className={otherButton+" mt-2"} disabled={busy}
          onClick={()=>void download("cover","docx")}>Need editable Word instead?</button>
      </article>

      <article className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-5 flex-1">
          <span className="text-sm font-semibold text-slate-500">3 · When the full report is needed</span>
          <h3 className="mt-2 text-xl font-extrabold text-slate-900">Valuation Report</h3>
          <p className="mt-2 text-base leading-relaxed text-slate-600">First page: letterhead with QR. Following pages: your normal valuation report.</p>
          {reports.length>1 && <label className="mt-4 block text-sm font-semibold text-slate-700">Bank / report format
            <select className="cv-field mt-2" value={reportId}
              onChange={e=>setReportId(e.target.value)}>
              {reports.map(item=><option key={item.id} value={item.id}>{item.format_name}</option>)}
            </select>
          </label>}
          {!selectedReport && <p className="mt-4 text-sm text-amber-800">
            No report format linked. <Link className="font-bold underline" href="/dashboard/report-formats">Set up report format</Link>.
          </p>}
        </div>
        <button className={mainButton} type="button" disabled={busy||!selectedReport}
          onClick={()=>void download("report","pdf")}>
          {working==="report"?"Preparing report…":"Download Report + Letterhead"}
          <span className="mt-1 block text-xs font-medium text-white/85">One PDF · letterhead first</span>
        </button>
        {selectedReport && <details className="mt-3">
          <summary className="cursor-pointer text-sm font-bold text-teal-800 underline underline-offset-4">Need only the Word report?</summary>
          <DownloadWordReport compact templateId={templateId}
            certificateNumber={certificateNumber} preferredFormatId={selectedReport.id}
            fieldValues={fieldValues}/>
        </details>}
      </article>
    </div>}
    {!loading && !defaultHead && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      No saved letterhead found. The downloads will use a plain A4 page with QR.
      <Link className="ml-2 font-bold underline" href="/dashboard/cover-letters">Upload your letterhead once</Link>.
    </p>}
    {!loading && matchingCovers.length>1 && <details className="rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer font-bold text-slate-700">More options · choose a different cover-letter layout</summary>
      <label className="mt-4 block max-w-xl text-sm font-medium text-slate-700">
        Cover format
        <select aria-label="Cover letter format" className="cv-field mt-2"
          value={chosenCover?.id??""}
          onChange={event=>{setCoverId(event.target.value);setManualText(null);setMessage("");}}>
          {matchingCovers.map(item=><option key={item.id} value={item.id}>
            {item.name}{item.is_default?" · Default":""}
          </option>)}
        </select>
      </label>
      <Link className="mt-4 inline-block text-sm font-bold text-teal-800 underline"
        href="/dashboard/cover-letters">Manage letterheads and QR position</Link>
    </details>}
    {message && <p role="status" className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-base font-medium text-slate-800">{message}</p>}
    {resultUrl && <a href={resultUrl} target="_blank" rel="noopener noreferrer"
      className="inline-block text-sm font-bold text-teal-800 underline">Open last PDF to print</a>}
  </section>;
}
