"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  base64ToBytes, downloadReport, generateWordReport, openWordDocument,
  type ReportBinding,
} from "@/lib/reports/docx-visual";

export function DownloadWordReport({
  templateId, certificateNumber, fieldValues,
}: {
  templateId: string | null;
  certificateNumber: string;
  fieldValues: Array<{ field_name: string; field_value: string | null }>;
}) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  if (!templateId) return null;

  async function download() {
    if (!templateId || working) return;
    setWorking(true);
    setMessage("");
    try {
      const { data, error } = await supabase.from("cv_report_formats")
        .select("file_name,docx_base64,bindings")
        .eq("template_id", templateId).maybeSingle();
      if (error) throw new Error("Report storage is unavailable or you do not have access.");
      if (!data) throw new Error("No Word report is attached to this template. Ask the template administrator to upload one.");
      const bindings = data.bindings as ReportBinding[];
      if (!Array.isArray(bindings) || bindings.length === 0) throw new Error("The report designer has no linked fields yet.");
      const values: Record<string, string> = {};
      for (const field of fieldValues) values[field.field_name] = field.field_value ?? "";
      const missing = [...new Set(bindings.map(item => item.fieldName).filter(name => !(name in values)))];
      if (missing.length) {
        throw new Error("This certificate is missing report fields: " + missing.join(", ") + ". Update the template mapping or issue a matching certificate.");
      }
      const docx = await openWordDocument(base64ToBytes(data.docx_base64 as string));
      const report = await generateWordReport(docx, bindings, values);
      downloadReport(report, "CertVerify-Report-" + certificateNumber + ".docx");
      setMessage("Word report generated. Review the document in Word before sending or signing it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create report.");
    } finally {
      setWorking(false);
    }
  }

  return <section className="rounded-2xl border border-teal-200 bg-teal-50 p-6">
    <h2 className="text-lg font-bold text-slate-900">Generate Word report</h2>
    <p className="mt-2 text-sm text-slate-600">
      Fill the professional report linked to this certificate template using the saved certificate details.
      This is a downloadable editable Word file; your verification QR is available separately below.
    </p>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button type="button" disabled={working} onClick={() => void download()}
        className="rounded-lg bg-teal-800 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:opacity-50">
        {working ? "Generating report…" : "Download Word report (.docx)"}
      </button>
      <Link href={"/dashboard/templates/" + templateId + "/report"} className="text-sm font-semibold text-teal-900 underline">
        Open report designer
      </Link>
    </div>
    {message && <p role="status" className="mt-3 text-sm text-slate-800">{message}</p>}
  </section>;
}
