"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { DEFAULT_PLACEMENT, fillCoverText, savePdf, type CoverPlacement, validatePlacement } from "@/lib/cover-letters/generator";
import { createPrintableDocument, detectKind, inspectFile, previewFirstPage, FILE_TYPES, type DocumentKind } from "@/lib/cover-letters/native-documents";
import { downloadLetterhead, letterheadStoragePath, removeUncommittedLetterhead, uploadLetterhead } from "@/lib/cover-letters/private-storage";
import { downloadWordOriginal } from "@/lib/reports/private-storage";
import { generateWordReport, openWordDocument, type ReportBinding } from "@/lib/reports/docx-visual";

type Letterhead = CoverPlacement & {
  id: string; account_id: string; name: string; file_name: string; file_type: string;
  storage_path: string; body_template: string; template_id: string | null; report_format_id: string | null; is_default: boolean;
};
type Certificate = {
  id: string; certificate_id: string; public_verification_id: string; template_id: string | null;
  template_name: string | null; report_format_id: string | null; status: string; created_at: string;
};
type Template = { id: string; name: string };
type Format = { id: string; format_name: string; template_id: string; storage_path: string; bindings: ReportBinding[] };
type Field = { field_name: string; field_value: string | null };

const formatError = (error: unknown) => error instanceof Error ? error.message : "Something went wrong. Please try again.";
const blank = (): CoverPlacement => ({ ...DEFAULT_PLACEMENT });
const buttonClass = "rounded-xl border border-[#bed6d6] px-4 py-2.5 text-sm font-semibold text-[#245264] hover:bg-[#eff9f8]";
const safeFile = (name: string) => name.replace(/[^a-z0-9 _().-]/gi, "_").slice(0, 120);
function fieldInsert(text: string, name: string): string { return text + "{{" + name + "}}"; }

export default function CoverLettersPage() {
  const [saved, setSaved] = useState<Letterhead[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [formats, setFormats] = useState<Format[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [templateId, setTemplateId] = useState("");
  const [certificateId, setCertificateId] = useState("");
  const [name, setName] = useState("");
  const [linkedTemplateId, setLinkedTemplateId] = useState("");
  const [defaultFormatId, setDefaultFormatId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [original, setOriginal] = useState<Blob | null>(null);
  const [kind, setKind] = useState<DocumentKind>("jpg");
  const [previewPage, setPreviewPage] = useState("");
  const [layout, setLayout] = useState<CoverPlacement>(blank);
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [textOpen, setTextOpen] = useState(true);
  const [editedAuto, setEditedAuto] = useState<string | null>(null);
  const [placement, setPlacement] = useState<"qr" | "text">("qr");
  const [includeReport, setIncludeReport] = useState(false);
  const [reportFormatId, setReportFormatId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [message, setMessage] = useState("");
  const [printUrl, setPrintUrl] = useState("");
  const [settingUp, setSettingUp] = useState(false);
  const [setupExpanded, setSetupExpanded] = useState(false);
  const [pageRatio, setPageRatio] = useState(297 / 210);
  const capture = useRef<{x: number; y: number; moving: boolean} | null>(null);
  const saveLock = useRef(false);
  const initialLetterhead = useRef(false);
  const latestPreview = useRef(0);
  const lastPdf = useRef("");

  const current = saved.find(item => item.id === templateId);
  const certificate = certificates.find(item => item.id === certificateId);
  const chosenSource = file ?? original;
  const visibleFormats = formats.filter(f => f.template_id === certificate?.template_id);
  const linkedFormats = formats.filter(f => f.template_id === linkedTemplateId);
  const matched = !linkedTemplateId || certificate?.template_id === linkedTemplateId;
  const finalAutoText = editedAuto ?? fillCoverText(bodyTemplate, fields);
  const body = textOpen ? finalAutoText : "";
  const availableFieldNames = useMemo(() => Object.keys(fields).sort((a, b) => a.localeCompare(b)), [fields]);

  const loadLibrary = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Please sign in to use cover letters.");
    const accountId = requireSelectedAccountId();
    const [letters, certs, tmpl, fmts, member] = await Promise.all([
      supabase.from("cv_cover_letter_templates").select("*").eq("account_id", accountId).order("name"),
      supabase.from("certificates").select("id,certificate_id,public_verification_id,template_id,template_name,report_format_id,status,created_at").eq("account_id", accountId).order("created_at", { ascending: false }).limit(400),
      supabase.from("certificate_templates").select("id,name").eq("account_id", accountId).order("name"),
      supabase.from("cv_report_format_library").select("id,format_name,template_id,storage_path,bindings").eq("account_id", accountId).order("format_name"),
      supabase.from("account_members").select("role").eq("account_id", accountId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
    ]);
    if (letters.error) throw new Error("Cover-letter storage unavailable: " + letters.error.message);
    if (certs.error) throw new Error("Cannot load your certificates: " + certs.error.message);
    if (tmpl.error || fmts.error) throw new Error("Cannot load certificate templates and report formats.");
    if (!member.data) throw new Error("You do not have access to this workspace.");
    setSaved((letters.data ?? []) as Letterhead[]);
    setCertificates((certs.data ?? []) as Certificate[]);
    setTemplates((tmpl.data ?? []) as Template[]);
    setFormats((fmts.data ?? []) as Format[]);
    setCanManage(["owner", "admin"].includes(member.data.role));
    const requestedHead = new URLSearchParams(window.location.search).get("letterhead");
    if (!initialLetterhead.current && requestedHead) {
      initialLetterhead.current = true;
      const head = (letters.data ?? []).find(item => item.id === requestedHead) as Letterhead | undefined;
      if (head) {
        setTemplateId(head.id);
        setName(head.name);
        setLinkedTemplateId(head.template_id ?? "");
        setDefaultFormatId(head.report_format_id ?? "");
        setLayout({qr_x:head.qr_x,qr_y:head.qr_y,qr_size:head.qr_size,
          text_x:head.text_x,text_y:head.text_y,text_width:head.text_width,text_height:head.text_height});
        setBodyTemplate(head.body_template);
        const data = await downloadLetterhead(head.storage_path);
        const sourceKind = detectKind({name:head.file_name,type:head.file_type});
        setOriginal(data);
        setKind(sourceKind);
        await createPreview(data,sourceKind);
      }
    }
    const requestedTemplate = new URLSearchParams(window.location.search).get("template");
    if (requestedTemplate && (tmpl.data ?? []).some(item => item.id === requestedTemplate) &&
        !new URLSearchParams(window.location.search).get("letterhead")) {
      setLinkedTemplateId(requestedTemplate);
    }
    const requested = new URLSearchParams(window.location.search).get("certificate");
    setCertificateId(previous => previous && (certs.data ?? []).some(item => item.id === previous) ? previous :
      (certs.data ?? []).find(item => item.id === requested)?.id ?? (certs.data ?? [])[0]?.id ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(loadLibrary).catch(err => {
      if (active) setMessage(formatError(err));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadLibrary]);

  useEffect(() => {
    if (!certificateId) return;
    let active = true;
    void supabase.from("certificate_field_values")
      .select("field_name,field_value").eq("certificate_id", certificateId).order("display_order")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setMessage("Could not load certificate fields."); return; }
        const c = certificates.find(item => item.id === certificateId);
        const values: Record<string, string> = {};
        for (const f of (data ?? []) as Field[]) values[f.field_name] = f.field_value ?? "";
        if (c) {
          values["Certificate Number"] = c.certificate_id;
          values["Date"] = new Date().toLocaleDateString("en-IN");
          values["Certificate Date"] = new Date(c.created_at).toLocaleDateString("en-IN");
          values["Status"] = c.status;
        }
        setFields(values);
      });
    return () => { active = false; };
  }, [certificateId, certificates]);

  async function createPreview(source: Blob, sourceKind: DocumentKind) {
    const token = ++latestPreview.current;
    setSettingUp(true);
    try {
      const canvas = await previewFirstPage(source, sourceKind);
      if (token !== latestPreview.current) return;
      if (canvas.width < 300 || canvas.height < 300) throw new Error("The document page is too small for printing.");
      const aspect = canvas.height / canvas.width;
      if (aspect < 0.9 || aspect > 2) throw new Error("Use a portrait letterhead page (A4 recommended).");
      setPageRatio(aspect);
      setPreviewPage(canvas.toDataURL("image/jpeg", 0.86));
    } catch (error) {
      if (token === latestPreview.current) { setPreviewPage(""); setMessage(formatError(error)); }
      throw error;
    } finally { if (token === latestPreview.current) setSettingUp(false); }
  }

  async function openTemplate(id: string) {
    const candidate = saved.find(item => item.id === id);
    setTemplateId(id); setMessage(""); setPreviewPage("");
    setFile(null); setOriginal(null); setEditedAuto(null); setPrintUrl("");
    setSetupExpanded(false); setIncludeReport(false);
    if (!candidate) {
      setName(""); setLayout(blank()); setLinkedTemplateId(""); setDefaultFormatId("");
      setBodyTemplate(""); setTextOpen(true); setSettingUp(false); return;
    }
    setName(candidate.name);
    setLinkedTemplateId(candidate.template_id ?? "");
    setDefaultFormatId(candidate.report_format_id ?? "");
    setLayout({
      qr_x: candidate.qr_x, qr_y: candidate.qr_y, qr_size: candidate.qr_size,
      text_x: candidate.text_x, text_y: candidate.text_y, text_width: candidate.text_width, text_height: candidate.text_height,
    });
    setBodyTemplate(candidate.body_template);
    setTextOpen(true);
    try {
      const data = await downloadLetterhead(candidate.storage_path);
      setOriginal(data);
      const sourceKind = detectKind({ name: candidate.file_name, type: candidate.file_type });
      setKind(sourceKind);
      await createPreview(data, sourceKind);
    } catch (error) { setMessage(formatError(error)); }
  }

  async function uploadDocument(input?: File) {
    if (!input) return;
    setMessage(""); setPrintUrl("");
    try {
      const fileKind = await inspectFile(input);
      // Validate Word/PDF before uploading: the same preview is shown when printing.
      await createPreview(input, fileKind);
      setFile(input); setOriginal(null); setKind(fileKind);
      // Advanced mappings stay collapsed until the user chooses to open them.
      setSetupExpanded(false);
      setMessage("Document ready. Drag QR onto the page or click a position, then save the layout.");
    } catch (error) { setMessage(formatError(error)); }
  }

  function positionPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!canManage || !previewPage) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setLayout(previous => placement === "qr"
      ? { ...previous, qr_x: Math.min(x, 1 - previous.qr_size), qr_y: Math.min(y, 1 - previous.qr_size) }
      : { ...previous, text_x: Math.min(x, 1 - previous.text_width), text_y: Math.min(y, 1 - previous.text_height) });
  }
  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canManage) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    capture.current = { x: event.clientX, y: event.clientY, moving: false };
    positionPointer(event);
  }
  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!capture.current) return;
    if (Math.hypot(event.clientX - capture.current.x, event.clientY - capture.current.y) > 3) capture.current.moving = true;
    positionPointer(event);
  }

  async function saveLayout() {
    if (busy || saveLock.current || !canManage) return;
    saveLock.current = true; setBusy(true); setMessage("");
    let uploadedPath = ""; let success = false;
    try {
      const clean = name.trim();
      if (clean.length < 2 || clean.length > 100) throw new Error("Enter a name for the reusable letterhead.");
      if (!chosenSource) throw new Error("Upload your PDF, Word or image letterhead first.");
      if (!previewPage) throw new Error("Open a valid document before saving.");
      validatePlacement(layout);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to save letterhead.");
      const id = current?.id ?? crypto.randomUUID();
      const accountId = requireSelectedAccountId();
      const path = file ? letterheadStoragePath(id, FILE_TYPES[kind]) : current!.storage_path;
      if (file) { await uploadLetterhead(path, file); uploadedPath = path; }
      // The first account-wide letterhead becomes the automatic default.
      // Later formats are optional specialized layouts selected per certificate.
      const defaultForAccount = !linkedTemplateId && !defaultFormatId &&
        (!!current?.is_default || !saved.some(item => item.is_default));
      const payload = {
        is_default: defaultForAccount,
        name: clean, account_id: accountId, file_name: file?.name ?? current!.file_name,
        file_type: file ? FILE_TYPES[kind] : current!.file_type, storage_path: path,
        body_template: bodyTemplate, template_id: linkedTemplateId || null,
        report_format_id: defaultFormatId || null, ...layout,
      };
      const { error } = current
        ? await supabase.from("cv_cover_letter_templates").update(payload).eq("id", id)
        : await supabase.from("cv_cover_letter_templates").insert({ ...payload, id, created_by: user.id });
      if (error) throw new Error(error.code === "23505" ? "A letterhead with that name already exists, or another default already exists. Choose your default in My Cover Letters." : "Could not save: " + error.message);
      success = true;
      if (file) setOriginal(file);
      setFile(null); setTemplateId(id);
      window.location.assign("/dashboard/my-cover-letters#letterheads");
    } catch (error) {
      if (uploadedPath && !success) await removeUncommittedLetterhead(uploadedPath);
      setMessage(formatError(error));
    } finally { setBusy(false); saveLock.current = false; }
  }

  async function prepareReport(): Promise<Blob> {
    const selected = visibleFormats.find(item => item.id === (reportFormatId || defaultReport));
    if (!selected) throw new Error("Choose the report format to include.");
    const values = { ...fields };
    const missing = [...new Set(selected.bindings.map(item => item.fieldName).filter(key => !(key in values)))];
    if (missing.length) throw new Error("Certificate is missing mapped report fields: " + missing.join(", "));
    const word = await openWordDocument(await downloadWordOriginal(selected.storage_path));
    return generateWordReport(word, selected.bindings, values);
  }
  async function generate(download: boolean) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      if (!chosenSource || !previewPage) throw new Error("Choose a letterhead format first.");
      if (!certificate) throw new Error("Choose an issued certificate for this example.");
      if (!matched) throw new Error("This cover format belongs to a different certificate template.");
      if (includeReport && !chosenReportFormat) throw new Error("Choose a Word report format.");
      const report = includeReport ? await prepareReport() : null;
      const output = await createPrintableDocument({
        background: chosenSource, kind, verificationId: certificate.public_verification_id,
        body, placement: layout, report,
      });
      const url = URL.createObjectURL(output);
      if (lastPdf.current) URL.revokeObjectURL(lastPdf.current);
      lastPdf.current = url; setPrintUrl(url);
      if (download) savePdf(output, "Cover Letter - " + safeFile(certificate.certificate_id));
      setMessage("Example PDF generated on demand. Only the reusable cover format is stored.");
    } catch (error) { setMessage(formatError(error)); }
    finally { setBusy(false); }
  }

  useEffect(() => () => { if (lastPdf.current) URL.revokeObjectURL(lastPdf.current); }, []);
  const allowed = !!certificate && matched && !!previewPage && !settingUp;
  const defaultReport = certificate ? (visibleFormats.find(f => f.id === current?.report_format_id)?.id ??
    visibleFormats.find(f => f.id === certificate.report_format_id)?.id ?? visibleFormats[0]?.id ?? "") : "";
  const chosenReportFormat = reportFormatId || defaultReport;

  return <main className="cv-page">
    <div className="cv-shell space-y-5 pb-14">
      <div className="flex flex-wrap items-center justify-between gap-2"><Link href="/dashboard" className="text-sm font-semibold text-teal-800 underline">← Dashboard</Link><Link href="/dashboard/my-cover-letters" className="text-sm font-bold text-teal-800 underline">My Cover Letters</Link></div>
      <header className="cv-hero"><div className="cv-hero__body">
        <p className="cv-eyebrow mb-2">ONE-TIME SETUP · REPEATABLE PRINTING</p>
        <h1 className="text-3xl font-extrabold !text-white">Cover Letter Format Designer</h1>
        <p className="mt-2 text-sm text-[#d2e5ec]">Set up your usual letterhead and QR position once for every certificate. Special template-linked or report-linked formats are optional and can be added later.</p>
      </div></header>
      {message && <p role="status" className="rounded-xl border border-[#addbd6] bg-white p-4 text-sm text-[#214d5f]">{message}</p>}
      {loading ? <p role="status" className="cv-panel p-8">Loading letterhead library…</p> : <>
        <section className="cv-panel rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-56 flex-1">
              <label className="text-sm font-semibold">1. Choose letterhead
                <select aria-label="Choose saved letterhead" className="cv-field mt-2" value={templateId} onChange={e => void openTemplate(e.target.value)}>
                  <option value="">+ New letterhead</option>
                  {saved.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>
            {canManage && <button type="button" className={buttonClass} onClick={() => void openTemplate("")}>+ New letterhead</button>}
          </div>
          {canManage && <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Give it a name
              <input className="cv-field mt-2" value={name} maxLength={100} placeholder="Standard cover letter" onChange={e => setName(e.target.value)}/>
            </label>
            <label className="text-sm font-semibold">Upload PDF, Word (.docx), JPG or PNG
              <input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" className="cv-field mt-2 block w-full"
                onChange={e => void uploadDocument(e.target.files?.[0])}/>
              <span className="mt-1 block text-xs font-normal text-slate-500">12 MB maximum. Your original file stays private.</span>
            </label>
          </div>}
          {!current && !saved.some(item=>item.is_default) && <p className="mt-3 text-sm text-teal-800">Your first general letterhead will automatically be used for certificates. You can change it later under My Cover Letters.</p>}
          {!canManage && <p className="mt-3 text-sm text-slate-500">Your organization administrator can add letterheads. You can print using any existing letterhead you have access to.</p>}
        </section>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(315px,0.83fr)]">
          <section className="cv-panel rounded-2xl p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-[#173b4b]">2. Place your QR</h2>
              {canManage && previewPage && <div className="flex gap-2">
                <button type="button" className={placement === "qr" ? "rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white" : buttonClass}
                  onClick={() => setPlacement("qr")}>Move QR</button>
                <button type="button" className={placement === "text" ? "rounded-lg bg-teal-800 px-3 py-2 text-xs font-bold text-white" : buttonClass}
                  onClick={() => setPlacement("text")}>Move text box</button>
              </div>}
            </div>
            <p className="mt-1 mb-4 text-sm text-slate-600">Click anywhere on the page or drag the QR position. Text placement is only needed when you want a letter.</p>
            {settingUp && <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm">Rendering the uploaded document…</p>}
            {previewPage ? <div className="mx-auto max-w-[550px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              <div className={"relative touch-none select-none " + (canManage ? "cursor-crosshair" : "")}
                style={{ aspectRatio: 1 / pageRatio }}
                role="button" aria-label="Click or drag to set QR or text position"
                tabIndex={canManage ? 0 : -1}
                onPointerDown={pointerDown} onPointerMove={pointerMove}
                onPointerUp={() => { capture.current = null; }}
                onPointerCancel={() => { capture.current = null; }}
                onKeyDown={e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault(); const n = e.key === "ArrowRight" ? [0.01,0] : e.key === "ArrowLeft" ? [-0.01,0] : e.key === "ArrowDown" ? [0,0.01] : [0,-0.01];
                  setLayout(old => ({ ...old, qr_x: Math.max(0,Math.min(1-old.qr_size,old.qr_x+n[0])), qr_y: Math.max(0,Math.min(1-old.qr_size,old.qr_y+n[1])) })); } }}>
                {/* The preview is a rendering of the user's PDF, Word or image, not a generic mockup. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewPage} alt="Your imported letterhead page" className="absolute inset-0 h-full w-full"/>
                <div className="pointer-events-none absolute flex items-center justify-center border-2 border-[#008b80] bg-white/95 text-center text-[11px] font-extrabold text-teal-800 shadow"
                  style={{ left: layout.qr_x * 100 + "%", top: layout.qr_y * 100 + "%",
                    width: layout.qr_size * 100 + "%", aspectRatio: "1" }}>QR</div>
                {textOpen && <div className="pointer-events-none absolute overflow-hidden border-2 border-dashed border-amber-600 bg-amber-50/50 p-1 text-[10px] text-slate-800"
                  style={{left:layout.text_x*100+"%",top:layout.text_y*100+"%",width:layout.text_width*100+"%",height:layout.text_height*100+"%"}}>
                  Text area
                </div>}
              </div>
            </div> : !settingUp && <div className="mx-auto flex aspect-[210/297] max-w-[390px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
              Upload a letterhead or select one you saved previously. The actual page will appear here.
            </div>}
            {canManage && <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold">QR size
                <input aria-label="QR size" className="ml-3 align-middle" type="range" min="0.1" max="0.25" step="0.01" value={layout.qr_size}
                  onChange={e => setLayout(previous => ({
                    ...previous, qr_size: Number(e.target.value),
                    qr_x: Math.min(previous.qr_x, 1-Number(e.target.value)),
                    qr_y: Math.min(previous.qr_y, 1-Number(e.target.value)),
                  }))}/>
              </label>
              <span className="text-xs text-slate-500">QR includes a white scanning background.</span>
            </div>}
          </section>

          <div className="space-y-5">
            <section className="cv-panel rounded-2xl p-5">
              <h2 className="text-lg font-extrabold text-[#173b4b]">3. Preview with a certificate</h2>
              <label className="mt-3 block text-sm font-semibold">Issued certificate
                <select className="cv-field mt-2" value={certificateId} aria-label="Certificate for verification QR"
                  onChange={e => { setCertificateId(e.target.value); setEditedAuto(null); setReportFormatId(""); setPrintUrl(""); }}>
                  {!certificates.length && <option value="">No certificates yet</option>}
                  {certificates.map(c => <option key={c.id} value={c.id}>{c.certificate_id} · {c.template_name ?? "Certificate"}</option>)}
                </select>
              </label>
              {!matched && <p role="alert" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This letterhead is mapped to another certificate template. Choose a matching certificate.</p>}
              <div className="mt-4 rounded-xl border border-[#dae7e7] p-3">
                <button type="button" aria-expanded={textOpen}
                  className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-teal-900"
                  onClick={() => setTextOpen(!textOpen)}>
                  <span>Example cover-letter text (optional)</span>
                  <span>{textOpen ? "Hide text · plain QR" : "Show text"}</span>
                </button>
                {textOpen && <textarea className="cv-field mt-3 min-h-44 w-full text-sm"
                  aria-label="Example cover-letter text" value={finalAutoText}
                  onChange={e => setEditedAuto(e.target.value)}
                  placeholder="Paste any text here, or save reusable auto-fill wording in the format settings below."/>}
                {!textOpen && <p className="mt-2 text-xs text-slate-500">The example will contain only the original letterhead and QR.</p>}
              </div>
            </section>

            <section className="cv-panel rounded-2xl p-5">
              <h2 className="text-lg font-extrabold text-[#173b4b]">4. Preview output (not saved)</h2>
              <label className="mt-3 flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={includeReport} onChange={e => setIncludeReport(e.target.checked)} disabled={visibleFormats.length===0} />
                Include the Word report after the letter
              </label>
              {includeReport && <label className="mt-3 block text-sm font-semibold">Saved report format
                <select className="cv-field mt-2" value={chosenReportFormat}
                  onChange={e => setReportFormatId(e.target.value)}>
                  {visibleFormats.map(format => <option key={format.id} value={format.id}>{format.format_name}</option>)}
                </select>
              </label>}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button type="button" className={buttonClass} disabled={!allowed || busy} onClick={() => void generate(false)}>Preview PDF</button>
                <button type="button" className="cv-primary disabled:opacity-40" disabled={!allowed || busy} onClick={() => void generate(true)}>{busy ? "Preparing…" : "Download PDF"}</button>
              </div>
              {printUrl && <div className="mt-4 space-y-3">
                <a className="inline-flex rounded-xl bg-[#e0f7ee] px-4 py-3 text-sm font-bold text-teal-900" href={printUrl} target="_blank" rel="noopener noreferrer">Open PDF to print</a>
                <iframe title="Your finished printable PDF" className="h-96 w-full rounded-lg border" src={printUrl}/>
              </div>}
              <p className="mt-3 text-xs leading-5 text-slate-500">Only the named reusable cover format is saved. Preview and Download create temporary PDFs; no certificate-specific cover letter is retained.</p>
            </section>
          </div>
        </div>

        {canManage && <section className="cv-panel rounded-2xl p-5 sm:p-6">
          <button type="button" onClick={() => setSetupExpanded(!setupExpanded)} aria-expanded={setupExpanded}
            className="flex w-full items-center justify-between text-left font-extrabold text-[#173b4b]">
            Format auto-fill and report linking (optional) <span>{setupExpanded ? "−" : "+"}</span>
          </button>
          <p className="mt-2 text-sm text-slate-500">The organization administrator links fields and report formats once. Users download covers directly from Certificate Details.</p>
          {setupExpanded && <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold">Link letterhead to a certificate template (optional)
                <select className="cv-field mt-2" value={linkedTemplateId}
                  onChange={e => { setLinkedTemplateId(e.target.value); setDefaultFormatId(""); }}>
                  <option value="">Any certificate template</option>
                  {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold">Default Word report format (optional)
                <select disabled={!linkedTemplateId} className="cv-field mt-2" value={defaultFormatId} onChange={e=>setDefaultFormatId(e.target.value)}>
                  <option value="">No default report</option>
                  {linkedFormats.map(f=><option key={f.id} value={f.id}>{f.format_name}</option>)}
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-600">Auto-fill uses the same saved fields as your certificate template and report format. Field mappings are reused—no duplicate data entry.</p>
            <label className="block text-sm font-semibold">Reusable letter wording
              <textarea className="cv-field mt-2 min-h-48 w-full font-mono text-sm" value={bodyTemplate}
                onChange={e=>{setBodyTemplate(e.target.value);setEditedAuto(null);}} maxLength={12000}
                placeholder={"Date: {{Date}}\nRef: {{Certificate Number}}\n\nSubject: {{Property Address}}\n\nThis letter accompanies the attached report."}/>
            </label>
            <label className="block text-sm font-semibold">Insert saved field
              <select className="cv-field mt-2" value="" onChange={e=> {if(e.target.value){setBodyTemplate(old=>fieldInsert(old,e.target.value));setEditedAuto(null);}}}>
                <option value="">Choose a field to insert</option>
                {availableFieldNames.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </label>
          </div>}
          <button type="button" className="cv-primary mt-4 disabled:opacity-40" disabled={busy || !previewPage || !canManage}
            onClick={() => void saveLayout()}>{busy ? "Saving…" : current ? "Save format → My Cover Letters" : "Save format → My Cover Letters"}</button>
        </section>}
      </>}
    </div>
  </main>;
}
