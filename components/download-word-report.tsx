"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { safeReportFileName } from "@/lib/reports/report-filenames";
import {
  downloadWordOriginal, listReportFormats, type ReportFormat,
} from "@/lib/reports/private-storage";
import {
  downloadReport, generateWordReport, openWordDocument, type ReportBinding,
} from "@/lib/reports/docx-visual";

export function DownloadWordReport({
  templateId, certificateNumber, fieldValues, preferredFormatId, onlyFormatId,
}: {
  templateId: string | null;
  certificateNumber: string;
  preferredFormatId?: string | null;
  onlyFormatId?: string;
  fieldValues: Array<{ field_name: string; field_value: string | null }>;
}) {
  const [formats, setFormats] = useState<ReportFormat[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!templateId) return;
    let active = true;
    void listReportFormats(templateId).then(items => {
      if (!active) return;
      const visible = onlyFormatId ? items.filter(item => item.id === onlyFormatId) : items;
      setFormats(visible);
      setSelectedId(visible.find(item => item.id === preferredFormatId)?.id ?? visible[0]?.id ?? "");
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [templateId, preferredFormatId, onlyFormatId]);

  if (!templateId || loading || formats.length === 0) return null;

  async function download() {
    if (working) return;
    setWorking(true); setMessage("");
    try {
      const selected = formats.find(format => format.id === selectedId);
      if (!selected) throw new Error("Select a Word report format.");
      const bindings = selected.bindings as ReportBinding[];
      if (!Array.isArray(bindings) || bindings.length === 0) throw new Error("This report format has no linked fields yet.");
      const values: Record<string, string> = {};
      for (const field of fieldValues) values[field.field_name] = field.field_value ?? "";
      const missing = [...new Set(bindings.map(item => item.fieldName).filter(name => !(name in values)))];
      if (missing.length) throw new Error("Certificate is missing fields: " + missing.join(", ") + ". Use a compatible report format.");
      const docx = await openWordDocument(await downloadWordOriginal(selected.storage_path));
      const report = await generateWordReport(docx, bindings, values);
      downloadReport(report, safeReportFileName(selected.format_name) + " - " + safeReportFileName(certificateNumber) + ".docx");
      setMessage("Word report generated on demand. No generated document has been saved to your database.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate report.");
    } finally { setWorking(false); }
  }

  return <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6">
    <h2 className="text-lg font-bold text-slate-900">{onlyFormatId ? "Generate report using this format" : "Word report (optional)"}</h2>
    <p className="mt-2 text-sm text-slate-600">{onlyFormatId ? "This download uses the selected client-named report format and certificate data." : "Download any format for this template using the same saved certificate fields."} Generated Word reports are never stored.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="min-w-52 flex-1 text-sm font-semibold">Report format
        <select aria-label="Report format" disabled={!!onlyFormatId} className="cv-field mt-2" value={selectedId} onChange={event => setSelectedId(event.target.value)}>
          {formats.map(item => <option key={item.id} value={item.id}>{item.format_name}</option>)}
        </select>
      </label>
      <button type="button" disabled={working} onClick={() => void download()}
        className="rounded-lg bg-teal-800 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
        {working ? "Generating report…" : "Download Word report"}
      </button>
      <Link href={"/dashboard/templates/" + templateId + "/report?format=" + encodeURIComponent(selectedId)}
        className="text-sm font-semibold text-teal-900 underline">Report designer</Link>
    </div>
    {message && <p role="status" className="mt-3 text-sm text-slate-800">{message}</p>}
  </section>;
}
