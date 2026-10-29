"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { DownloadWordReport } from "@/components/download-word-report";

type RecordRow = {
  id: string; certificate_id: string; template_id: string | null;
  template_name: string | null; report_format_id: string | null;
  status: string; created_at: string;
};
type FormatRow = { id: string; template_id: string; format_name: string };
type FieldValue = { field_name: string; field_value: string | null };

export default function MyReportsPage() {
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [formats, setFormats] = useState<FormatRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingValues, setLoadingValues] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sign in to view your report library.");
        const account = requireSelectedAccountId();
        const [certs, available] = await Promise.all([
          supabase.from("certificates")
            .select("id,certificate_id,template_id,template_name,report_format_id,status,created_at")
            .eq("account_id", account).order("created_at", { ascending: false }).limit(500),
          supabase.from("cv_report_format_library")
            .select("id,template_id,format_name").eq("account_id", account).order("format_name"),
        ]);
        if (certs.error) throw new Error("Could not load certificates: " + certs.error.message);
        if (available.error) throw new Error("Could not load Word report formats: " + available.error.message);
        if (!live) return;
        setRecords(certs.data ?? []);
        setFormats(available.data ?? []);
      } catch (error) {
        if (live) setMessage(error instanceof Error ? error.message : "Could not open My Reports.");
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => { live = false; };
  }, []);

  const reportable = useMemo(() => {
    const templateIds = new Set(formats.map(format => format.template_id));
    const query = search.trim().toLowerCase();
    return records.filter(record => record.template_id && templateIds.has(record.template_id) &&
      (!query || [record.certificate_id, record.template_name ?? "", record.status].some(text => text.toLowerCase().includes(query))));
  }, [records, formats, search]);

  const chosen = records.find(record => record.id === selected);
  async function choose(recordId: string) {
    if (selected === recordId) { setSelected(null); setFields([]); return; }
    setSelected(recordId); setFields([]); setLoadingValues(true); setMessage("");
    try {
      const { data, error } = await supabase.from("certificate_field_values")
        .select("field_name,field_value").eq("certificate_id", recordId).order("display_order");
      if (error) throw new Error("Cannot load saved certificate fields: " + error.message);
      setFields(data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load report data.");
    } finally {
      setLoadingValues(false);
    }
  }

  return <main className="cv-page">
    <div className="cv-shell space-y-6 pb-14">
      <header className="cv-hero">
        <div className="cv-hero__body flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="cv-eyebrow mb-2">MY CERTIFICATES &amp; REPORTS</p>
            <h1 className="text-3xl font-extrabold !text-white">My Reports</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d2e5ec]">
              Find certificates that can be turned into Word reports. Choose a client or bank format and generate a fresh .docx from the original template and saved certificate data.
            </p>
          </div>
          <Link href="/dashboard/report-formats"
            className="cv-primary shrink-0 !border-[#35bea9] !bg-[#47d5c2] !text-[#082b35]">Manage Word formats →</Link>
        </div>
      </header>

      <section className="cv-panel flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#193b4e]">Reports are generated only when you download them</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">CertVerify keeps the original Word formats and certificate data, not individual generated report files. A certificate may be downloaded again in another compatible format.</p>
        </div>
        <Link className="rounded-xl border border-[#c5dbe0] px-5 py-3 text-sm font-semibold text-[#28615f] hover:bg-[#f3faf9]"
          href="/dashboard/certificates/list">View certificates</Link>
      </section>

      {message && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="min-w-[235px] flex-1 text-sm font-semibold text-[#2b4d61]">
          Search reports
          <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Certificate number, template or status" className="cv-field mt-2"/>
        </label>
        <span className="rounded-full bg-[#e8f8f1] px-4 py-2 text-sm font-bold text-[#11685e]">{reportable.length} report-ready certificate{reportable.length === 1 ? "" : "s"}</span>
      </div>

      {loading ? <p role="status" className="cv-panel p-8 text-sm text-slate-600">Loading available reports…</p>
        : reportable.length === 0 ? <div className="cv-panel rounded-3xl p-8 text-center sm:p-12">
          <h2 className="text-xl font-extrabold text-[#19384d]">No report-ready certificates found</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
            {formats.length === 0 ? "First attach a Word report format to one of your certificate templates. Your existing certificates can then use that format." :
              "No certificates match this search or use a template with a saved Word report format."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link className="cv-primary" href="/dashboard/report-formats">Set up Word formats</Link>
            <Link className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-600" href="/dashboard/certificates/list">My Certificates</Link>
          </div>
        </div>
        : <section className="space-y-3" aria-label="Report-ready certificates">
          {reportable.map(record => {
            const formatsForTemplate = formats.filter(format => format.template_id === record.template_id);
            const expanded = selected === record.id;
            return <article key={record.id} className="cv-panel overflow-hidden rounded-2xl">
              <div className="flex flex-wrap items-center gap-4 p-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#e7f7f0] text-[#087a70]">
                  <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 3h9l5 5v13H6zM15 3v6h5M9 13h8M9 17h8"/></svg>
                </div>
                <div className="min-w-56 flex-1">
                  <p className="font-extrabold text-[#1c3a50]">{record.certificate_id}</p>
                  <p className="mt-1 text-xs text-slate-500">{record.template_name || "Certificate template"} · {new Date(record.created_at).toLocaleDateString("en-IN")} · {record.status}</p>
                </div>
                <span className="rounded-full bg-[#edf5f7] px-3 py-1.5 text-xs font-bold text-[#315a69]">
                  {formatsForTemplate.length} Word format{formatsForTemplate.length === 1 ? "" : "s"}
                </span>
                <button type="button" aria-expanded={expanded} onClick={() => void choose(record.id)}
                  className="rounded-xl bg-[#0c756b] px-4 py-3 text-sm font-bold text-white hover:bg-[#085f57]">
                  {expanded ? "Close report" : "Generate Word report"}
                </button>
              </div>
              {expanded && <div className="border-t border-[#e2eeec] bg-[#f9fcfc] p-5">
                {loadingValues ? <p role="status" className="text-sm text-slate-600">Loading report fields…</p>
                  : chosen && <DownloadWordReport key={chosen.id} templateId={chosen.template_id}
                    certificateNumber={chosen.certificate_id}
                    preferredFormatId={chosen.report_format_id}
                    fieldValues={fields}/>}
                <Link className="mt-3 inline-flex text-sm font-semibold text-[#0a7770] underline"
                  href={"/dashboard/certificates/" + record.id}>Open certificate &amp; QR</Link>
              </div>}
            </article>;
          })}
        </section>}
      <p className="text-xs text-slate-500">Showing up to 500 recent certificates in this workspace; use My Certificates to access older records. No generated Word report files are retained.</p>
    </div>
  </main>;
}
