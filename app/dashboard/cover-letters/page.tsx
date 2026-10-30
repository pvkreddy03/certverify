"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import {
  canvasToPdf, DEFAULT_BODY, DEFAULT_PLACEMENT, fillCoverText,
  renderCoverPage, savePdf, validatePlacement, type CoverPlacement,
} from "@/lib/cover-letters/generator";

const BUCKET = "certverify-letterheads";
const MAX_BYTES = 6 * 1024 * 1024;
type Letterhead = CoverPlacement & {
  id: string; account_id: string; name: string; file_name: string;
  file_type: string; storage_path: string; body_template: string;
};
type Certificate = {
  id: string; certificate_id: string; public_verification_id: string;
  status: string; created_at: string;
};
type CertificateField = { field_name: string; field_value: string | null };
const empty = () => ({ ...DEFAULT_PLACEMENT });

function downloadImage(url: string, name: string) {
  const link = document.createElement("a");
  link.href = url; link.download = name + ".jpg";
  document.body.appendChild(link); link.click(); link.remove();
}
export default function CoverLetterDesigner() {
  const search = useSearchParams();
  const [items, setItems] = useState<Letterhead[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [certificateId, setCertificateId] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [templateId, setTemplateId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [background, setBackground] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [name, setName] = useState("");
  const [layout, setLayout] = useState<CoverPlacement>(empty);
  const [layoutBody, setLayoutBody] = useState(DEFAULT_BODY);
  const [draft, setDraft] = useState("");
  const [positionMode, setPositionMode] = useState<"qr" | "text">("qr");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const saveLock = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const selectedCertificate = certificates.find(c => c.id === certificateId);
  const current = items.find(i => i.id === templateId);
  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Sign in to use your letterhead library.");
    const accountId = requireSelectedAccountId();
    const [saved, certs, member] = await Promise.all([
      supabase.from("cv_cover_letter_templates").select("*").eq("account_id", accountId).order("name"),
      supabase.from("certificates").select("id,certificate_id,public_verification_id,status,created_at")
        .eq("account_id", accountId).order("created_at", { ascending: false }).limit(300),
      supabase.from("account_members").select("role").eq("account_id", accountId)
        .eq("user_id", user.id).eq("status", "active").maybeSingle(),
    ]);
    if (saved.error) throw new Error("Letterhead storage has not been set up: " + saved.error.message);
    if (certs.error) throw new Error("Could not load the certificates: " + certs.error.message);
    if (!member.data || member.error) throw new Error("Choose an active organization.");
    setItems((saved.data ?? []) as Letterhead[]);
    setCertificates((certs.data ?? []) as Certificate[]);
    setCanEdit(["owner", "admin"].includes(member.data.role));
    const requested = search.get("certificate");
    setCertificateId(old => old && (certs.data ?? []).some(c => c.id === old) ? old :
      (certs.data ?? []).find(c => c.id === requested)?.id ?? (certs.data ?? [])[0]?.id ?? "");
  }, [search]);

  useEffect(() => {
    let active = true;
    void refresh().catch(error => {
      if (active) setMessage(error instanceof Error ? error.message : "Could not load cover letters.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (!certificateId) return;
    let active = true;
    void supabase.from("certificate_field_values").select("field_name,field_value")
      .eq("certificate_id", certificateId).order("display_order")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setMessage("Could not load saved certificate fields."); return; }
        const record = certificates.find(item => item.id === certificateId);
        const next: Record<string, string> = {};
        for (const field of (data ?? []) as CertificateField[]) next[field.field_name] = field.field_value ?? "";
        if (record) {
          next["Certificate Number"] = record.certificate_id;
          next["Date"] = new Date(record.created_at).toLocaleDateString("en-IN");
          next["Status"] = record.status;
        }
        setFields(next);
      });
    return () => { active = false; };
  }, [certificateId, certificates]);

  useEffect(() => {
    const source = file ?? background;
    if (!source) { setImageUrl(""); return; }
    const url = URL.createObjectURL(source);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, background]);

  useEffect(() => {
    const template = items.find(item => item.id === templateId);
    if (!template || file) return;
    let active = true;
    void supabase.storage.from(BUCKET).download(template.storage_path).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) setMessage("Could not download private letterhead background.");
      else setBackground(data);
    });
    return () => { active = false; };
  }, [templateId, items, file]);

  useEffect(() => {
    const source = current?.body_template ?? layoutBody;
    setDraft(fillCoverText(source, fields));
  }, [current?.body_template, fields]);

  function selectTemplate(value: string) {
    setMessage(""); setPreviewUrl(""); setFile(null); setBackground(null); setTemplateId(value);
    const chosen = items.find(item => item.id === value);
    if (chosen) {
      setName(chosen.name);
      setLayout({
        qr_x: chosen.qr_x, qr_y: chosen.qr_y, qr_size: chosen.qr_size,
        text_x: chosen.text_x, text_y: chosen.text_y,
        text_width: chosen.text_width, text_height: chosen.text_height,
      });
      setLayoutBody(chosen.body_template);
      setDraft(fillCoverText(chosen.body_template, fields));
    } else {
      setName(""); setLayout(empty()); setLayoutBody(DEFAULT_BODY);
      setDraft(fillCoverText(DEFAULT_BODY, fields));
    }
  }

  async function handleImage(input: File | undefined) {
    if (!input) return;
    setMessage("");
    if (!["image/jpeg", "image/png"].includes(input.type) || !/[.](jpg|jpeg|png)$/i.test(input.name)) {
      setMessage("For precise letterhead printing, upload JPG or PNG. PDF and Word import still need the separate page-conversion feature; please export them as a high-quality image for now.");
      return;
    }
    if (!input.size || input.size > MAX_BYTES) { setMessage("Choose a letterhead image smaller than 6 MB."); return; }
    const bytes = new Uint8Array(await input.slice(0, 8).arrayBuffer());
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    if (!(input.type === "image/jpeg" ? jpg : png)) { setMessage("The file is not a valid JPG or PNG image."); return; }
    setFile(input); setBackground(null); setPreviewUrl("");
  }

  function positionAt(event: React.MouseEvent<HTMLDivElement>) {
    if (!canEdit) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, (event.clientX - rect.left) / rect.width);
    const y = Math.max(0, (event.clientY - rect.top) / rect.height);
    setLayout(old => positionMode === "qr"
      ? { ...old, qr_x: Math.min(x, 1 - old.qr_size), qr_y: Math.min(y, 1 - old.qr_size) }
      : { ...old, text_x: Math.min(x, 1 - old.text_width), text_y: Math.min(y, 1 - old.text_height) });
    setPreviewUrl("");
  }

  async function saveTemplate() {
    if (!canEdit || busy || saveLock.current) return;
    saveLock.current = true; setBusy(true); setMessage("");
    let uploaded = ""; let success = false;
    try {
      const clean = name.trim();
      if (clean.length < 2 || clean.length > 100) throw new Error("Name the letterhead in 2–100 characters.");
      if (!file && !current) throw new Error("Upload your letterhead first.");
      if (layoutBody.length > 12000) throw new Error("Letter text is too long.");
      validatePlacement(layout);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired. Sign in again.");
      const accountId = requireSelectedAccountId();
      const id = current?.id ?? crypto.randomUUID();
      const ext = (file?.type ?? current?.file_type) === "image/png" ? "png" : "jpg";
      const path = file ? [accountId, id, crypto.randomUUID() + "." + ext].join("/") : current!.storage_path;
      if (file) {
        const result = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
        if (result.error) throw new Error("Could not save private letterhead: " + result.error.message);
        uploaded = path;
      }
      const payload = {
        account_id: accountId, name: clean, file_name: file?.name ?? current!.file_name,
        file_type: file?.type ?? current!.file_type, storage_path: path,
        body_template: layoutBody, ...layout,
      };
      const result = current
        ? await supabase.from("cv_cover_letter_templates").update(payload).eq("id", id)
        : await supabase.from("cv_cover_letter_templates").insert({ ...payload, id, created_by: user.id });
      if (result.error) throw new Error(result.error.code === "23505" ?
        "A letterhead with that name already exists." : "Could not save the letterhead: " + result.error.message);
      success = true;
      setFile(null); setTemplateId(id);
      await refresh();
      setMessage("Letterhead and QR placement saved. Reuse this template for every new certificate.");
    } catch (error) {
      if (uploaded && !success) await supabase.storage.from(BUCKET).remove([uploaded]);
      setMessage(error instanceof Error ? error.message : "Could not save letterhead.");
    } finally { setBusy(false); saveLock.current = false; }
  }

  async function generate(type: "pdf" | "jpeg") {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const image = file ?? background;
      if (!image) throw new Error("Choose or upload a letterhead first.");
      if (!selectedCertificate) throw new Error("Choose a certificate to generate its QR.");
      const canvas = await renderCoverPage({
        background: image, position: layout,
        verificationId: selectedCertificate.public_verification_id, body: draft,
      });
      const safeName = ("Cover Letter - " + selectedCertificate.certificate_id).replace(/[^a-z0-9 _.()-]/gi, "_");
      setPreviewUrl(canvas.toDataURL("image/jpeg", 0.88));
      if (type === "pdf") savePdf(canvasToPdf(canvas), safeName);
      else downloadImage(canvas.toDataURL("image/jpeg", 0.95), safeName);
      setMessage("Generated for " + selectedCertificate.certificate_id + ". This document is not stored on the server.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate the cover letter."); }
    finally { setBusy(false); }
  }

  return <main className="cv-page">
    <div className="cv-shell space-y-5 pb-14">
      <Link className="inline-flex text-sm font-semibold text-teal-800 underline" href="/dashboard">← Dashboard</Link>
      <header className="cv-hero"><div className="cv-hero__body">
        <p className="cv-eyebrow mb-2">DOCUMENT AUTOMATION</p>
        <h1 className="text-3xl font-extrabold !text-white">Cover Letters &amp; QR Placement</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d2e5ec]">Save your letterhead and QR position once. Select a certificate, check auto-filled details, and download a print-ready cover letter.</p>
      </div></header>
      {message && <p role="status" className="rounded-xl border border-[#b5dad5] bg-white p-4 text-sm font-semibold text-[#225261]">{message}</p>}
      {loading ? <div role="status" className="cv-panel rounded-2xl p-8">Loading letterheads…</div> : <>
        <section className="cv-panel space-y-4 rounded-2xl p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-[#173b4b]">1. Choose your letterhead</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-56 flex-1 text-sm font-bold text-[#285261]">Saved letterhead
              <select className="cv-field mt-2" aria-label="Saved letterhead" value={templateId} onChange={event => selectTemplate(event.target.value)}>
                <option value="">+ New letterhead</option>
                {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            {canEdit && <button type="button" onClick={() => selectTemplate("")} className="rounded-xl border border-[#bed5dd] px-4 py-3 text-sm font-bold">Create new</button>}
          </div>
          {canEdit ? <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-semibold">Letterhead name
              <input className="cv-field mt-2" value={name} onChange={event => setName(event.target.value)} maxLength={100} placeholder="e.g. Standard valuation cover"/>
            </label>
            <label className="text-sm font-semibold">Letterhead image (JPG or PNG, 6 MB max)
              <input ref={fileInput} className="cv-field mt-2 block w-full" type="file" accept=".jpg,.jpeg,.png,.pdf,.docx" onChange={event => void handleImage(event.target.files?.[0])}/>
            </label>
          </div> : <p className="text-sm text-slate-600">Organization owners and admins set the letterhead once. Everyone with certificate access can generate a cover letter.</p>}
          <p className="text-xs text-slate-500">PDF and Word letterhead imports are planned next. Export them to a clear portrait JPG/PNG for accurate placement in this first test.</p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(275px,0.8fr)]">
          <section className="cv-panel rounded-2xl p-4 sm:p-6">
            <h2 className="text-lg font-extrabold text-[#173b4b]">2. Place your QR and letter text</h2>
            <p className="mb-4 mt-1 text-sm text-slate-600">Select a position, then click the page. You only need to do this once.</p>
            {canEdit && <div className="mb-4 flex flex-wrap gap-2">
              <button type="button" aria-pressed={positionMode === "qr"} onClick={() => setPositionMode("qr")}
                className={"rounded-lg px-4 py-2 text-sm font-bold " + (positionMode === "qr" ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-700")}>Place QR</button>
              <button type="button" aria-pressed={positionMode === "text"} onClick={() => setPositionMode("text")}
                className={"rounded-lg px-4 py-2 text-sm font-bold " + (positionMode === "text" ? "bg-teal-800 text-white" : "bg-slate-100 text-slate-700")}>Place text</button>
              <label className="ml-auto text-xs font-semibold">QR size
                <input className="ml-2 align-middle" type="range" min={0.10} max={0.25} step={0.01} value={layout.qr_size}
                  onChange={event => setLayout(old => ({
                    ...old, qr_size: Number(event.target.value),
                    qr_x: Math.min(old.qr_x, 1 - Number(event.target.value)),
                    qr_y: Math.min(old.qr_y, 1 - Number(event.target.value)),
                  }))}/>
              </label>
            </div>}
            {imageUrl ? <div className="mx-auto max-w-[525px] overflow-hidden rounded-lg border border-slate-200 shadow-lg">
              <div role="button" tabIndex={canEdit ? 0 : -1} aria-label="Letterhead preview, click to set placement"
                onClick={positionAt}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") event.preventDefault(); }}
                className={"relative " + (canEdit ? "cursor-crosshair" : "")}>
                <img src={imageUrl} alt="Your private letterhead page" className="block h-auto w-full"/>
                <div className="pointer-events-none absolute flex aspect-square items-center justify-center border-2 border-teal-600 bg-white text-center text-[10px] font-extrabold text-teal-900 shadow"
                  style={{ left: (layout.qr_x * 100) + "%", top: (layout.qr_y * 100) + "%", width: (layout.qr_size * 100) + "%" }}>
                  QR<br/>HERE
                </div>
                <div className="pointer-events-none absolute overflow-hidden whitespace-pre-wrap border-2 border-dashed border-[#ca7c1d] bg-amber-50/70 p-1 text-[10px] leading-tight text-slate-700"
                  style={{ left: (layout.text_x * 100) + "%", top: (layout.text_y * 100) + "%",
                    width: (layout.text_width * 100) + "%", height: (layout.text_height * 100) + "%" }}>
                  Letter text area
                </div>
              </div>
            </div> : <div className="flex aspect-[210/297] max-w-[400px] items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">Upload a portrait JPG/PNG letterhead or choose a saved one to see placement.</div>}
          </section>

          <div className="space-y-5">
            <section className="cv-panel space-y-4 rounded-2xl p-5">
              <h2 className="text-lg font-extrabold text-[#173b4b]">3. Reusable letter wording</h2>
              <p className="text-xs text-slate-600">Use double brackets for saved certificate fields, such as <code>{"{{Property Address}}"}</code>. The values fill automatically each time.</p>
              {canEdit ? <>
                <textarea className="cv-field min-h-56 w-full font-mono text-xs" aria-label="Reusable letter wording"
                  value={layoutBody} maxLength={12000} onChange={event => setLayoutBody(event.target.value)}/>
                <label className="text-xs font-semibold">Insert a certificate field
                  <select aria-label="Insert certificate field" className="cv-field mt-1" value=""
                    onChange={event => { if (event.target.value) setLayoutBody(old => old + "{{" + event.target.value + "}}"); }}>
                    <option value="">Select a field</option>
                    {Object.keys(fields).map(key => <option key={key} value={key}>{key}</option>)}
                  </select>
                </label>
                <button disabled={busy || !imageUrl} type="button" onClick={() => void saveTemplate()} className="cv-primary w-full disabled:opacity-50">{busy ? "Saving…" : current ? "Save changes to letterhead" : "Save reusable letterhead"}</button>
              </> : <p className="text-sm text-slate-600">This wording is managed by your organization. You can edit the final letter before downloading.</p>}
            </section>
            <section className="cv-panel space-y-4 rounded-2xl p-5">
              <h2 className="text-lg font-extrabold text-[#173b4b]">4. Fill and download</h2>
              <label className="block text-sm font-semibold">Certificate
                <select className="cv-field mt-2" aria-label="Certificate for cover letter" value={certificateId} onChange={event => setCertificateId(event.target.value)}>
                  {certificates.length === 0 && <option value="">No certificates available</option>}
                  {certificates.map(c => <option key={c.id} value={c.id}>{c.certificate_id} · {c.status}</option>)}
                </select>
              </label>
              <p className="text-xs text-slate-500">This letter uses the selected certificate&apos;s public verification QR. Revoked certificates remain marked revoked on the public verification page.</p>
              <label className="block text-sm font-semibold">Final letter text — editable
                <textarea className="cv-field mt-2 min-h-64 w-full whitespace-pre-wrap text-sm" aria-label="Editable final cover letter" value={draft}
                  onChange={event => setDraft(event.target.value)}/>
              </label>
              <button disabled={busy || !imageUrl || !certificateId} type="button" onClick={() => void generate("pdf")}
                className="cv-primary w-full disabled:opacity-50">{busy ? "Generating…" : "Download print-ready PDF"}</button>
              <button disabled={busy || !imageUrl || !certificateId} type="button" onClick={() => void generate("jpeg")}
                className="w-full rounded-xl border border-teal-700 px-4 py-3 text-sm font-bold text-teal-800 disabled:opacity-50">Download JPG</button>
              {selectedCertificate && <Link href={"/dashboard/certificates/" + selectedCertificate.id} className="block text-center text-sm font-semibold text-teal-800 underline">Open certificate and Word report downloads</Link>}
            </section>
          </div>
        </div>
        {previewUrl && <section className="cv-panel rounded-2xl p-5">
          <h2 className="text-lg font-bold text-[#173b4b]">Generated letter preview</h2>
          <p className="mt-1 text-sm text-slate-600">Review the page and scan the QR before printing.</p>
          <img className="mx-auto mt-4 max-h-[750px] max-w-full border shadow" src={previewUrl} alt="Finished cover letter with verification QR"/>
        </section>}
      </>}
    </div>
  </main>;
}