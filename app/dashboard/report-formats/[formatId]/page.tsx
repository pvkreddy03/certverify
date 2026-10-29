"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { DownloadWordReport } from "@/components/download-word-report";

type SavedFormat = {
  id: string;
  template_id: string;
  account_id: string;
  format_name: string;
  file_name: string;
  bindings: Array<{ fieldName?: string }>;
  created_at: string;
  updated_at: string;
};
type CertificateRecord = {
  id: string;
  certificate_id: string;
  status: string;
  created_at: string;
};
type SavedValue = { field_name: string; field_value: string | null };

export default function SavedReportFormatPage() {
  const { formatId } = useParams<{ formatId: string }>();
  const [format, setFormat] = useState<SavedFormat | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [certificates, setCertificates] = useState<CertificateRecord[]>([]);
  const [chosenId, setChosenId] = useState("");
  const [values, setValues] = useState<SavedValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldsError, setFieldsError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sign in to view your saved report formats.");
        const accountId = requireSelectedAccountId();
        const saved = await supabase.from("cv_report_format_library")
          .select("id,template_id,account_id,format_name,file_name,bindings,created_at,updated_at")
          .eq("id", formatId).eq("account_id", accountId).maybeSingle();
        if (saved.error || !saved.data) throw new Error("This report format was not found in your current workspace.");
        const record = saved.data as SavedFormat;
        const [template, compatible] = await Promise.all([
          supabase.from("certificate_templates").select("name").eq("id", record.template_id).eq("account_id", accountId).maybeSingle(),
          supabase.from("certificates")
            .select("id,certificate_id,status,created_at")
            .eq("template_id", record.template_id).eq("account_id", accountId)
            .order("created_at", { ascending: false }).limit(100),
        ]);
        if (template.error) throw new Error("Could not load the assigned certificate template.");
        if (compatible.error) throw new Error("Could not load compatible certificates.");
        if (!active) return;
        setFormat(record);
        setTemplateName(template.data?.name ?? "Certificate template");
        setCertificates(compatible.data ?? []);
        setChosenId(compatible.data?.[0]?.id ?? "");
        const flag = new URLSearchParams(window.location.search);
        if (flag.has("created")) setNotice("Report format created successfully. Its client-assigned name is saved and the format is ready to reuse.");
        else if (flag.has("updated")) setNotice("Report format updated successfully.");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Report format could not be loaded.");
      } finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; };
  }, [formatId]);

  useEffect(() => {
    if (!chosenId) return;
    let active = true;
    void Promise.resolve().then(() => {
      if (active) { setFieldsLoading(true); setFieldsError(""); setValues([]); }
    });
    void Promise.resolve(supabase.from("certificate_field_values")
      .select("field_name,field_value").eq("certificate_id", chosenId).order("display_order"))
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) setFieldsError("Could not read this certificate's saved report fields.");
        else setValues(data ?? []);
      }).finally(() => { if (active) setFieldsLoading(false); });
    return () => { active = false; };
  }, [chosenId]);

  if (loading) return <main className="cv-page"><div className="cv-shell p-8" role="status">Loading saved report format…</div></main>;
  if (!format) return <main className="cv-page px-4 py-12"><div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-8">
    <h1 className="text-xl font-bold text-[#17364b]">Report format unavailable</h1>
    <p role="alert" className="mt-3 text-sm text-amber-900">{error}</p>
    <Link href="/dashboard/report-formats" className="mt-5 inline-flex font-semibold text-teal-800 underline">← Return to Report Formats</Link>
  </div></main>;

  const editorUrl = "/dashboard/templates/" + format.template_id + "/report?format=" + encodeURIComponent(format.id);
  const mapped = new Set((format.bindings ?? []).map(item => item.fieldName).filter(Boolean));
  return <main className="cv-page min-h-screen">
    <div className="cv-shell space-y-6 pb-14">
      <Link href="/dashboard/report-formats" className="inline-flex text-sm font-semibold text-[#16796f] underline">← All Report Formats</Link>
      <header className="cv-hero">
        <div className="cv-hero__body flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 flex-1">
            <p className="cv-eyebrow mb-2">SAVED REPORT FORMAT</p>
            <h1 className="break-words text-3xl font-extrabold !text-white">{format.format_name}</h1>
            <p className="mt-3 text-sm text-[#d1eee7]">
              Assigned to: <strong>{templateName}</strong>
            </p>
            <p className="mt-1 text-xs text-[#b0d4d2]">Original attached Word file: {format.file_name}</p>
          </div>
          <Link className="inline-flex shrink-0 items-center rounded-xl border border-white/25 bg-white px-5 py-3 text-sm font-extrabold text-[#0a665e]"
            href={editorUrl}>Edit Report Format →</Link>
        </div>
      </header>
      {notice && <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-950">{notice}</p>}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="cv-panel rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#5b7785]">Format name</p>
          <p className="mt-2 break-words text-lg font-extrabold text-[#183b50]">{format.format_name}</p>
          <p className="mt-1 text-xs text-slate-500">Name selected by the customer</p>
        </div>
        <div className="cv-panel rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#5b7785]">Certificate template</p>
          <p className="mt-2 text-lg font-extrabold text-[#183b50]">{templateName}</p>
          <p className="mt-1 text-xs text-slate-500">Common data fields shared with this format</p>
        </div>
        <div className="cv-panel rounded-2xl p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#5b7785]">Mapped fields</p>
          <p className="mt-2 text-2xl font-extrabold text-[#0b8376]">{mapped.size}</p>
          <p className="mt-1 text-xs text-slate-500">Unique certificate fields linked in the Word file</p>
        </div>
      </section>

      <section className="cv-panel space-y-5 rounded-3xl p-6 sm:p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#0b8075]">GENERATE DOCUMENT</p>
          <h2 className="mt-2 text-xl font-extrabold text-[#163d50]">Generate a Word report</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Select an existing certificate created using <strong>{templateName}</strong>.
            CertVerify will fill this saved report format using that certificate&apos;s data and download a Word file named after <strong>{format.format_name}</strong>.
          </p>
        </div>
        {mapped.size === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          No fields have been mapped yet. <Link className="font-bold underline" href={editorUrl}>Open the Report Designer</Link> to link certificate fields before generating a populated report.
        </div>
        : certificates.length === 0 ? <div className="rounded-xl bg-[#f2f8f9] p-5">
          <p className="font-bold text-[#234b58]">No compatible certificates yet</p>
          <p className="mt-2 text-sm text-slate-600">Issue a certificate using the template <strong>{templateName}</strong>, then return here to generate its Word report.</p>
          <Link href="/dashboard/certificates" className="cv-primary mt-4 inline-flex">Create Certificate →</Link>
        </div> : <>
          <label className="block text-sm font-semibold text-[#254e60]">Choose certificate
            <select aria-label="Choose certificate for report" value={chosenId}
              onChange={event => setChosenId(event.target.value)} className="cv-field mt-2">
              {certificates.map(cert => <option key={cert.id} value={cert.id}>{cert.certificate_id} · {cert.status}</option>)}
            </select>
          </label>
          {fieldsError && <p role="alert" className="text-sm text-red-700">{fieldsError}</p>}
          {fieldsLoading ? <p role="status" className="text-sm text-slate-600">Loading certificate fields…</p>
            : chosenId && !fieldsError && <DownloadWordReport key={format.id + ":" + chosenId}
                templateId={format.template_id}
                certificateNumber={certificates.find(cert => cert.id === chosenId)?.certificate_id ?? ""}
                preferredFormatId={format.id} onlyFormatId={format.id} fieldValues={values}/>}
          <p className="text-xs text-slate-500">Only the selected named format will be used. Generated reports are downloaded on demand and are not saved as duplicates.</p>
        </>}
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href={editorUrl} className="rounded-xl border border-[#c4d8dc] bg-white px-5 py-3 text-sm font-bold text-[#23606a]">Edit field mappings or name</Link>
        <Link href={"/dashboard/templates/" + format.template_id} className="rounded-xl border border-[#c4d8dc] bg-white px-5 py-3 text-sm font-bold text-[#23606a]">Open assigned template</Link>
      </div>
    </div>
  </main>;
}
