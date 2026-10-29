"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";

type TemplateRow = { id: string; name: string; description: string | null; user_id: string };
type FormatRow = { id: string; template_id: string; format_name: string };
type Member = { role: string; can_manage_templates: boolean | null };

export default function ReportFormatsPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [formats, setFormats] = useState<FormatRow[]>([]);
  const [member, setMember] = useState<Member | null>(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sign in to manage Word report formats.");
        const accountId = requireSelectedAccountId();
        const [templateResult, formatResult, memberResult] = await Promise.all([
          supabase.from("certificate_templates").select("id,name,description,user_id").eq("account_id", accountId).order("created_at", { ascending: false }),
          supabase.from("cv_report_format_library").select("id,template_id,format_name").eq("account_id", accountId).order("format_name"),
          supabase.from("account_members").select("role,can_manage_templates").eq("account_id", accountId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
        ]);
        if (templateResult.error) throw new Error("Could not read templates: " + templateResult.error.message);
        if (formatResult.error) throw new Error("Word format storage is unavailable: " + formatResult.error.message);
        if (!memberResult.data || memberResult.error) throw new Error("This workspace is not available to your account.");
        if (!live) return;
        setTemplates(templateResult.data ?? []);
        setFormats(formatResult.data ?? []);
        setMember(memberResult.data);
        setUserId(user.id);
      } catch (error) {
        if (live) setMessage(error instanceof Error ? error.message : "Could not load Word reports.");
      } finally { if (live) setLoading(false); }
    }
    void load();
    return () => { live = false; };
  }, []);

  const canCreate = !!member && (member.role === "owner" || member.role === "admin" || member.can_manage_templates === true);
  const count = formats.length;

  return <main className="cv-page min-h-screen">
    <div className="cv-shell space-y-6 pb-14">
      <div className="cv-hero">
        <div className="cv-hero__body flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="cv-eyebrow mb-2">DOCUMENT AUTOMATION</p>
            <h1 className="text-3xl font-bold !text-white">Word Reports &amp; Formats</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d2e5ec]">
              Build one certificate template with shared fields, then attach separate Word report formats for each bank, client or purpose. Generate finished reports only when needed.
            </p>
          </div>
          {canCreate && <Link href="/dashboard/templates?create=1" className="cv-primary shrink-0 !border-[#35bea9] !bg-[#47d5c2] !text-[#082b35]">
            + Create certificate template
          </Link>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[{ number: templates.length, name: "Certificate templates", caption: "Reusable field sets" },
          { number: count, name: "Saved Word formats", caption: "Original DOCX files stored privately" },
          { number: "On demand", name: "Generated reports", caption: "No separate report files saved" }].map(tile =>
          <div key={tile.name} className="cv-panel rounded-2xl p-5">
            <p className="text-xs font-bold uppercase tracking-[.10em] text-[#527087]">{tile.name}</p>
            <p className="mt-2 text-2xl font-extrabold text-[#143b4e]">{tile.number}</p>
            <p className="mt-1 text-xs text-slate-500">{tile.caption}</p>
          </div>)}
      </div>

      <div className="cv-panel rounded-2xl border-l-4 border-l-[#13a48f] p-5 sm:p-6">
        <h2 className="text-lg font-bold text-[#173648]">How to create a Word report format</h2>
        <ol className="mt-3 grid gap-3 text-sm leading-6 text-[#3a5262] md:grid-cols-3">
          <li><strong className="text-[#088a7e]">1. Choose a template.</strong> For example, Open Plot Valuation. Add common certificate fields once.</li>
          <li><strong className="text-[#088a7e]">2. Add Word format.</strong> Upload SBI.docx, Canara.docx or another existing document and visually link its text to the fields.</li>
          <li><strong className="text-[#088a7e]">3. Generate when needed.</strong> Open an issued certificate, select the bank format and download the filled Word report.</li>
        </ol>
      </div>

      {message && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{message}</p>}
      {loading ? <div role="status" className="cv-panel rounded-2xl p-8 text-slate-600">Loading your report formats…</div>
      : templates.length === 0 ? <div className="cv-panel rounded-3xl p-8 text-center sm:p-12">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#e7f6f2] text-[#0b8378]">
            <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h9l5 5v13H6zM15 3v6h5M9 13h8M9 17h8"/></svg>
          </div>
          <h2 className="mt-4 text-xl font-bold text-[#19364c]">Start with a certificate template</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">A template defines the fields used by all of its Word formats. You can create formats for SBI, Canara, visa reports and other purposes under one template.</p>
          {canCreate ? <Link className="cv-primary mt-5 inline-flex" href="/dashboard/templates?create=1">Create template →</Link>
            : <p className="mt-4 text-sm text-amber-800">Ask your organization owner to create a template or grant you permission.</p>}
        </div>
      : <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-xl font-bold text-[#173648]">Your templates and Word formats</h2>
            <span className="text-sm text-slate-500">{templates.length} template{templates.length === 1 ? "" : "s"}</span>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {templates.map(t => {
              const linked = formats.filter(f => f.template_id === t.id);
              const canEdit = !!member && (member.role === "owner" || member.role === "admin" || (member.can_manage_templates === true && t.user_id === userId));
              return <article key={t.id} className="cv-card rounded-3xl p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e1f7f0] text-[#087969]">
                    <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3h14v18H5zM9 8h6M9 12h6M9 16h4"/></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-extrabold text-[#19354a]">{t.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{t.description || "Common certificate fields shared by all Word formats"}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#ecf4f5] px-3 py-1.5 text-xs font-bold text-[#336371]">{linked.length} format{linked.length === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-5 space-y-2">
                  {linked.length === 0 ? <p className="rounded-xl bg-[#f4f8f9] px-4 py-3 text-sm text-slate-600">No Word formats yet. Add your first .docx file.</p>
                    : linked.slice(0, 4).map(f => <Link key={f.id} href={"/dashboard/templates/" + t.id + "/report?format=" + encodeURIComponent(f.id)}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#deebed] px-4 py-3 text-sm font-semibold text-[#274b59] hover:bg-[#eef9f5]">
                      <span className="min-w-0 truncate">📄 {f.format_name}</span><span aria-hidden="true">→</span>
                    </Link>)}
                  {linked.length > 4 && <p className="text-xs text-slate-500">+ {linked.length - 4} more formats in the designer</p>}
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  {canEdit && <Link href={"/dashboard/templates/" + t.id + "/report?format=__new__"}
                    className="cv-primary inline-flex items-center justify-center">+ Create Word format</Link>}
                  <Link href={"/dashboard/templates/" + t.id}
                    className="inline-flex items-center justify-center rounded-xl border border-[#cbdce1] px-4 py-3 text-sm font-bold text-[#27536a] hover:bg-[#f3f9fa]">Edit fields</Link>
                  {!canEdit && <Link href={"/dashboard/templates/" + t.id + "/report"}
                    className="inline-flex items-center justify-center rounded-xl border border-[#cbdce1] px-4 py-3 text-sm font-bold text-[#27536a] hover:bg-[#f3f9fa]">View formats</Link>}
                </div>
              </article>;
            })}
          </div>
        </section>}
      <p className="text-xs text-slate-500">Word formats can be configured before subscribing, but creating new certificates still requires an active subscription. Existing QR verification continues to work.</p>
    </div>
  </main>;
}
