"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { supabase } from "@/lib/supabase";
import { fillCoverText, savePdf, type CoverPlacement } from "@/lib/cover-letters/generator";
import { createPrintableDocument, detectKind } from "@/lib/cover-letters/native-documents";
import { downloadLetterhead } from "@/lib/cover-letters/private-storage";
import { downloadWordOriginal } from "@/lib/reports/private-storage";
import { generateWordReport, openWordDocument, type ReportBinding } from "@/lib/reports/docx-visual";
import { matchingCoverFormats } from "@/lib/cover-letters/format-options";

type CoverFormat = CoverPlacement & {
  id: string; name: string; file_name: string; file_type: string;
  storage_path: string; body_template: string;
  template_id: string | null; report_format_id: string | null;
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

export function DownloadCoverLetter({
  certificateNumber, certificateCreatedAt, verificationId, templateId, preferredReportId, preferredCoverId, fieldValues,
}: Props) {
  const [covers, setCovers] = useState<CoverFormat[]>([]);
  const [reports, setReports] = useState<WordFormat[]>([]);
  const [coverId, setCoverId] = useState("");
  const [reportId, setReportId] = useState("");
  const [includeReport, setIncludeReport] = useState(true);
  const [textOpen, setTextOpen] = useState(true);
  const [manualText, setManualText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [resultUrl, setResultUrl] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      const accountId = requireSelectedAccountId();
      const [{ data: { user } }, { data: coverData, error: coverError }, { data: reportData, error: reportError }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("cv_cover_letter_templates")
          .select("id,name,file_name,file_type,storage_path,body_template,template_id,report_format_id,qr_x,qr_y,qr_size,text_x,text_y,text_width,text_height")
          .eq("account_id", accountId).order("name"),
        supabase.from("cv_report_format_library")
          .select("id,format_name,template_id,storage_path,bindings")
          .eq("account_id", accountId).order("format_name"),
      ]);
      if (!user) throw new Error("Sign in to download this cover letter.");
      if (coverError) throw new Error("Unable to load saved cover formats: " + coverError.message);
      if (reportError) throw new Error("Unable to load Word report formats: " + reportError.message);
      if (!live) return;
      const eligible = ((reportData ?? []) as WordFormat[]).filter(report => report.template_id === templateId);
      setCovers((coverData ?? []) as CoverFormat[]);
      setReports(eligible);
      setReportId(eligible.find(report => report.id === preferredReportId)?.id ?? eligible[0]?.id ?? "");
    }
    void load().catch(error => {
      if (live) setMessage(error instanceof Error ? error.message : "Unable to open cover-letter options.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [templateId, preferredReportId]);

  useEffect(() => () => { if (resultUrl) URL.revokeObjectURL(resultUrl); }, [resultUrl]);

  const selectedReportId = includeReport ? reportId || reports[0]?.id || null : null;
  const choices = useMemo(() => matchingCoverFormats(covers, templateId, selectedReportId),
    [covers, templateId, selectedReportId]);
  const chosen = choices.find(item => item.id === coverId) ?? choices.find(item => item.id === preferredCoverId) ?? choices[0];
  const values = useMemo(() => {
    const output: Record<string, string> = {};
    for (const item of fieldValues) output[item.field_name] = item.field_value ?? "";
    output["Certificate Number"] = certificateNumber;
    output["Certificate Date"] = output["Certificate Date"] || new Date(certificateCreatedAt).toLocaleDateString("en-IN");
    output["Date"] = new Date().toLocaleDateString("en-IN");
    return output;
  }, [fieldValues, certificateNumber, certificateCreatedAt]);

  const prefilled = chosen ? fillCoverText(chosen.body_template ?? "", values) : "";
  const currentText = manualText ?? prefilled;

  async function download() {
    if (working || !chosen) return;
    setWorking(true); setMessage("");
    try {
      const original = await downloadLetterhead(chosen.storage_path);
      const kind = detectKind({ name: chosen.file_name, type: chosen.file_type });
      let report: Blob | null = null;
      if (includeReport && selectedReportId) {
        const selected = reports.find(item => item.id === selectedReportId);
        if (!selected) throw new Error("Select a compatible Word report format.");
        const bindings = Array.isArray(selected.bindings) ? selected.bindings : [];
        const missing = [...new Set(bindings.map(item => item.fieldName).filter(name => !(name in values)))];
        if (missing.length) throw new Error("Missing mapped report fields: " + missing.join(", "));
        const word = await openWordDocument(await downloadWordOriginal(selected.storage_path));
        report = await generateWordReport(word, bindings, values);
      }
      const pdf = await createPrintableDocument({
        background: original, kind, verificationId,
        body: textOpen ? currentText : "",
        placement: {
          qr_x: chosen.qr_x, qr_y: chosen.qr_y, qr_size: chosen.qr_size,
          text_x: chosen.text_x, text_y: chosen.text_y, text_width: chosen.text_width, text_height: chosen.text_height,
        },
        report,
      });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      const url = URL.createObjectURL(pdf);
      setResultUrl(url);
      savePdf(pdf, "Cover Letter - " + certificateNumber);
      setMessage(report ? "Downloaded one PDF with your cover letter followed by the full report." :
        "Downloaded the cover letter PDF with its verification QR.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate cover letter.");
    } finally { setWorking(false); }
  }

  return <section className="rounded-2xl border border-teal-200 bg-white p-6 shadow-sm" aria-label="Download Cover Letter">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Download Cover Letter</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use a saved cover format and its QR position. Text is optional. The cover and Word report download together as one PDF.
        </p>
      </div>
      <Link className="text-sm font-semibold text-teal-800 underline" href="/dashboard/my-cover-letters">My Cover Letters</Link>
    </div>

    {loading ? <p role="status" className="mt-4 text-sm text-slate-500">Loading available formats…</p>
      : <div className="mt-4 space-y-4">
        {reports.length > 0 && <label className="block text-sm font-semibold text-slate-800">
          Word report to include
          <select aria-label="Word report to include" className="cv-field mt-2" value={includeReport ? selectedReportId ?? "" : "none"}
            onChange={event => {
              const value = event.target.value;
              setIncludeReport(value !== "none");
              if (value !== "none") setReportId(value);
              setCoverId(""); setManualText(null); setMessage("");
            }}>
            {reports.map(report => <option key={report.id} value={report.id}>{report.format_name} — complete report</option>)}
            <option value="none">Cover letter only (no report)</option>
          </select>
        </label>}

        {choices.length ? <>
          <label className="block text-sm font-semibold text-slate-800">
            Cover letter format
            <select aria-label="Cover letter format" className="cv-field mt-2" value={chosen?.id ?? ""}
              onChange={event => { setCoverId(event.target.value); setManualText(null); setMessage(""); }}>
              {choices.map(format => <option key={format.id} value={format.id}>
                {format.name}{format.report_format_id ? " · Report-linked" : format.template_id ? " · Template-linked" : " · General"}
              </option>)}
            </select>
          </label>

          <div className="rounded-xl border border-[#d5e7e6] p-4">
            <button type="button" aria-expanded={textOpen}
              className="flex w-full items-center justify-between gap-3 text-left text-sm font-bold text-[#215365]"
              onClick={() => { setTextOpen(!textOpen); setMessage(""); }}>
              <span>{textOpen ? "Letter text — edit, type or paste (optional)" : "Add letter text (optional)"}</span>
              <span>{textOpen ? "Hide text · print plain" : "Show text"}</span>
            </button>
            {textOpen && <div className="mt-3">
              <textarea aria-label="Letter text" className="cv-field min-h-36 w-full" value={currentText}
                placeholder="Type or paste your letter here. Leave empty for a plain cover letter with QR."
                onChange={event => setManualText(event.target.value)} />
              <p className="mt-2 text-xs text-slate-500">Saved auto-fill wording appears here when available. You can change it for this download. Nothing is saved.</p>
            </div>}
            {!textOpen && <p className="mt-2 text-xs text-teal-800">Plain letterhead + verification QR, no text.</p>}
          </div>
          <button type="button" disabled={working} onClick={() => void download()}
            className="rounded-xl bg-teal-800 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
            {working ? "Preparing full PDF…" : "Download Cover Letter" }
          </button>
          {resultUrl && <a href={resultUrl} target="_blank" rel="noopener noreferrer"
            className="ml-3 inline-block text-sm font-semibold text-teal-900 underline">Open and print the complete PDF</a>}
        </> : <div className="rounded-xl bg-teal-50 p-4">
          <p className="text-sm font-semibold text-teal-900">No compatible saved cover-letter format found.</p>
          <p className="mt-1 text-sm text-slate-700">Create a reusable cover format and link it to this certificate template or selected report format.</p>
          <Link href="/dashboard/cover-letters" className="mt-2 inline-block text-sm font-semibold text-teal-800 underline">Manage cover-letter formats</Link>
        </div>}
        <p className="text-xs text-slate-500">Only your reusable format is stored. No per-certificate cover-letter PDF is saved.</p>
      </div>}
    {message && <p role="status" className="mt-3 text-sm font-medium text-[#2a5864]">{message}</p>}
  </section>;
}
