"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { safeReportFileName } from "@/lib/reports/report-filenames";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { downloadWordOriginal, listReportFormats, removeUncommittedWord, reportStoragePath, uploadWordOriginal, type ReportFormat } from "@/lib/reports/private-storage";
import {
  downloadReport, generateWordReport, openWordDocument,
  validateBindings, type ReportBinding, type ReportParagraph, type VisualDocx,
} from "@/lib/reports/docx-visual";

type Field = { id: string; field_name: string; field_type: string };
type Target = { paragraph: number; start: number; end: number; sample: string };

function WordParagraph({
  paragraph, bindings, selected, onPick,
}: {
  paragraph: ReportParagraph; bindings: ReportBinding[]; selected: boolean;
  onPick: (paragraph: number) => void;
}) {
  const parts = paragraph.runs.flatMap((run, runIndex) => {
    const start = paragraph.runs.slice(0, runIndex).reduce((sum, item) => sum + item.text.length, 0);
    const offset = start + run.text.length;
    const cuts = new Set([0, run.text.length]);
    for (const binding of bindings) {
      if (binding.paragraph !== paragraph.index) continue;
      if (binding.start > start && binding.start < offset) cuts.add(binding.start - start);
      if (binding.end > start && binding.end < offset) cuts.add(binding.end - start);
    }
    const stops = [...cuts].sort((a, b) => a - b);
    return stops.slice(0, -1).map((from, segment) => {
      const to = stops[segment + 1], absolute = start + from;
      const matched = bindings.find(binding =>
        binding.paragraph === paragraph.index && binding.start <= absolute && binding.end > absolute
      );
      return <span
        key={runIndex + ":" + from}
        title={matched ? "Linked field: " + matched.fieldName : undefined}
        className={matched ? "rounded bg-teal-200/80 ring-1 ring-teal-400" : ""}
        style={{ fontWeight: run.bold ? 700 : undefined, fontStyle: run.italic ? "italic" : undefined,
          textDecoration: run.underline ? "underline" : undefined }}
      >{run.text.slice(from, to)}</span>;
    });
  });
  const insertions = bindings.filter(binding => binding.paragraph === paragraph.index && binding.start === binding.end);
  return <p
    data-docx-p={paragraph.index} onClick={() => onPick(paragraph.index)}
    className={"relative min-h-7 cursor-text whitespace-pre-wrap break-words rounded-sm px-1 py-0.5 leading-7 " +
      (selected ? "outline outline-2 outline-teal-500" : "hover:bg-teal-50")}
    style={{ textAlign: paragraph.align === "center" ? "center" : paragraph.align === "right" ? "right" : paragraph.align === "both" ? "justify" : "left",
      fontSize: paragraph.heading ? "1.25rem" : undefined, fontWeight: paragraph.heading ? 700 : undefined }}
  >{parts.length ? parts : <span className="text-slate-300">Click to insert field here</span>}
    {insertions.map((item, index) => <sup key={index} className="ml-1 rounded bg-teal-100 px-1 text-xs text-teal-900">+ {item.fieldName}</sup>)}
  </p>;
}

export default function VisualReportDesigner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  // Locks synchronously, before React can render a disabled button.
  const saveInFlight = useRef(false);
  const [docx, setDocx] = useState<VisualDocx | null>(null);
  const [filename, setFilename] = useState("");
  const [formats, setFormats] = useState<ReportFormat[]>([]);
  const [formatId, setFormatId] = useState<string | null>(null);
  const [formatName, setFormatName] = useState("");
  const [fileChanged, setFileChanged] = useState(false);
  const [fields, setFields] = useState<Field[]>([]);
  const [bindings, setBindings] = useState<ReportBinding[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [fieldId, setFieldId] = useState("");
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Log in to edit report formats.");
      const accountId = requireSelectedAccountId();
      const [template, member, fieldResult, available] = await Promise.all([
        supabase.from("certificate_templates").select("id,user_id,account_id").eq("id", id).single(),
        supabase.from("account_members").select("role,can_manage_templates").eq("account_id", accountId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
        supabase.from("certificate_fields").select("id,field_name,field_type").eq("template_id", id).order("display_order"),
        listReportFormats(id),
      ]);
      if (template.error) throw new Error("You cannot access this certificate template.");
      if (fieldResult.error) throw new Error(fieldResult.error.message);
      const canEdit = !!member.data && (
        member.data.role === "owner" || member.data.role === "admin" ||
        (member.data.role === "member" && member.data.can_manage_templates && template.data.user_id === user.id)
      );
      setAllowed(canEdit);
      setFields(fieldResult.data ?? []);
      setFormats(available);
      const requested = new URLSearchParams(window.location.search).get("format");
      const chosen = requested === "__new__" ? undefined : available.find(item => item.id === requested) ?? available[0];
      if (chosen) {
        const parsed = await openWordDocument(await downloadWordOriginal(chosen.storage_path));
        validateBindings(chosen.bindings, parsed.paragraphs);
        setDocx(parsed); setFilename(chosen.file_name); setBindings(chosen.bindings);
        setFormatId(chosen.id); setFormatName(chosen.format_name);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open report designer.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  async function upload(file: File) {
    setMessage("");
    if (!/\.docx$/i.test(file.name)) { setMessage("Upload a .docx file (not .doc or a PDF)."); return; }
    setBusy(true);
    try {
      const parsed = await openWordDocument(new Uint8Array(await file.arrayBuffer()));
      setDocx(parsed); setFilename(file.name); setBindings([]); setTarget(null);
      setFileChanged(true);
      setDirty(true);
      setMessage("Word report loaded. Select text in the page, then choose the field that replaces it.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open Word report."); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !previewRef.current) return;
    const range = selection.getRangeAt(0);
    function getParagraph(node: Node): HTMLElement | null {
      const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
      return element?.closest<HTMLElement>("[data-docx-p]") ?? null;
    }
    const left = getParagraph(range.startContainer), right = getParagraph(range.endContainer);
    if (!left || left !== right || !previewRef.current.contains(left)) {
      setMessage("Select text within a single paragraph or table cell. Map each section separately.");
      return;
    }
    const paragraph = Number(left.dataset.docxP);
    const beforeStart = range.cloneRange();
    beforeStart.selectNodeContents(left);
    beforeStart.setEnd(range.startContainer, range.startOffset);
    const beforeEnd = range.cloneRange();
    beforeEnd.selectNodeContents(left);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    const start = beforeStart.toString().length, end = beforeEnd.toString().length;
    const original = docx?.paragraphs[paragraph]?.text ?? "";
    if (start === end || end > original.length) {
      setMessage("Select only text from the original Word document (not a field label).");
      return;
    }
    setTarget({ paragraph, start, end, sample: original.slice(start, end) });
    setMessage("");
  }

  function clickParagraph(paragraph: number) {
    if (window.getSelection()?.toString().trim()) return;
    if (!docx || docx.paragraphs[paragraph].text.length !== 0) return;
    setTarget({ paragraph, start: 0, end: 0, sample: "(empty paragraph)" });
  }

  function addBinding() {
    if (!docx || !target || !fieldId) { setMessage("First select Word text and choose a certificate field."); return; }
    const field = fields.find(item => item.id === fieldId);
    if (!field) { setMessage("Select a valid certificate field."); return; }
    const next: ReportBinding = { paragraph: target.paragraph, start: target.start, end: target.end, fieldId: field.id, fieldName: field.field_name };
    try {
      validateBindings([...bindings, next], docx.paragraphs);
      setBindings(previous => [...previous, next]); setDirty(true); setTarget(null); setMessage("Field linked. Select more text or save your report format.");
      window.getSelection()?.removeAllRanges();
    } catch (error) { setMessage(error instanceof Error ? error.message : "This selection overlaps another field."); }
  }

  async function chooseFormat(nextId: string) {
    if (dirty && !window.confirm("Discard unsaved changes to this Word format?")) return;
    setBusy(true); setMessage(""); setTarget(null);
    try {
      if (nextId === "__new__") {
        setFormatId(null); setFormatName(""); setDocx(null); setBindings([]);
        setFilename(""); setFileChanged(false); setDirty(false);
      } else {
        const selected = formats.find(item => item.id === nextId);
        if (!selected) throw new Error("Select a valid Word format.");
        const document = await openWordDocument(await downloadWordOriginal(selected.storage_path));
        validateBindings(selected.bindings, document.paragraphs);
        setDocx(document); setFilename(selected.file_name); setBindings(selected.bindings);
        setFormatId(selected.id); setFormatName(selected.format_name);
        setFileChanged(false); setDirty(false);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open Word format."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!docx || !allowed || busy || saveInFlight.current) return;
    saveInFlight.current = true;
    setBusy(true); setMessage("");
    let uploaded: string | null = null;
    let saved = false;
    try {
      const title = formatName.trim();
      if (title.length < 2 || title.length > 120) throw new Error("Enter a report format name (2–120 characters).");
      validateBindings(bindings, docx.paragraphs);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired. Log in again.");
      const current = formats.find(item => item.id === formatId);
      // A customer-facing format is identified by its own chosen name, not by the upload filename.
      // Check here for immediate feedback; a unique database index also prevents concurrent duplicates.
      const existing = formats.find(item => item.id !== current?.id && item.format_name.trim().toLocaleLowerCase() === title.toLocaleLowerCase());
      if (existing) throw new Error('A report format named "' + existing.format_name + '" already exists for this template. Open it from the list or choose a different name.');
      const selectedId = current?.id ?? crypto.randomUUID();
      const path = (!current || fileChanged) ? reportStoragePath(id, selectedId) : current.storage_path;
      if (!current || fileChanged) {
        await uploadWordOriginal(path, docx.bytes);
        uploaded = path;
      }
      const payload = {
        template_id: id, account_id: requireSelectedAccountId(), format_name: title,
        file_name: filename, storage_path: path, bindings,
      };
      const query = current
        ? supabase.from("cv_report_format_library").update(payload).eq("id", current.id)
        : supabase.from("cv_report_format_library").insert({ ...payload, id: selectedId, created_by: user.id });
      const { error } = await query;
      if (error?.code === "23505") throw new Error("That report format name is already used for this template. Choose another name.");
      if (error) throw new Error("Could not save report format. " + error.message);
      saved = true;
      setFormatId(selectedId); setFileChanged(false); setDirty(false);
      // Replace instead of push: Back cannot resubmit a stale new-format form.
      router.replace("/dashboard/report-formats/" + selectedId + (current ? "?updated=1" : "?created=1"));
    } catch (error) {
      if (uploaded && !saved) await removeUncommittedWord(uploaded);
      setMessage(error instanceof Error ? error.message : "Could not save report format.");
    } finally {
      setBusy(false);
      if (!saved) saveInFlight.current = false;
    }
  }

  async function testDownload() {
    if (!docx) return;
    setBusy(true); setMessage("");
    try {
      const values: Record<string, string> = {};
      for (const field of fields) values[field.field_name] = testValues[field.id] || "[" + field.field_name + "]";
      const result = await generateWordReport(docx, bindings, values);
      downloadReport(result, "Sample - " + safeReportFileName(formatName.trim() || filename.replace(/\\.docx$/i, "")) + ".docx");
      setMessage("Sample generated. Open it in Word to review pagination, tables and formatting.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate sample."); }
    finally { setBusy(false); }
  }

  const mapped = useMemo(() => new Set(bindings.map(binding => binding.fieldId)), [bindings]);

  if (loading) return <main className="cv-page"><div className="cv-shell p-8">Loading Word report designer…</div></main>;
  return <main className="cv-page">
    <div className="cv-shell space-y-5 pb-12">
      <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
        <Link href="/dashboard/report-formats" className="text-teal-800 underline">← All report formats</Link>
        <Link href={"/dashboard/templates/" + id} className="text-slate-600 underline">Edit template fields</Link>
      </div>
      <div className="cv-hero"><div className="cv-hero__body">
        <p className="cv-eyebrow mb-2">VISUAL WORD REPORT DESIGNER</p>
        <h1 className="text-3xl font-bold text-white">Create and manage report formats</h1>
        <p className="mt-2 text-slate-200">Choose a saved bank or client format, or create a new one. Upload your existing .docx, highlight text and link it to certificate fields. You never need to type placeholders.</p>
      </div></div>
      {message && <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">{message}</p>}
      {!allowed && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">Only the template owner, authorized template editor or account administrator can change this report format.</p>}
      <div className="cv-panel space-y-3 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm font-semibold">
            Report format
            <select aria-label="Select Word report format" className="cv-field mt-2" value={formatId ?? "__new__"}
              disabled={busy} onChange={event => void chooseFormat(event.target.value)}>
              {formats.length === 0 && <option value="__new__">Create first report format</option>}
              {formats.map(item => <option key={item.id} value={item.id}>{item.format_name}</option>)}
              <option value="__new__">＋ New report format…</option>
            </select>
          </label>
          {allowed && <button className="rounded-lg border border-teal-600 px-4 py-3 text-sm font-semibold text-teal-900"
            type="button" disabled={busy} onClick={() => void chooseFormat("__new__")}>＋ Add format</button>}
        </div>
        <label className="block text-sm font-semibold">
          Client / bank report format name (e.g. SBI – Open Plot, Canara – Open Plot, Visa Report)
          <input aria-label="Word format name" className="cv-field mt-2" maxLength={120} value={formatName}
            disabled={!allowed || busy} onChange={event => { setFormatName(event.target.value); setDirty(true); }}
            placeholder="Example: SBI – Open Plot" required/>
        </label>
        <p className="text-xs text-slate-500">This name is how your saved format will appear in the library and report downloads. The attached Word filename is separate. Names cannot repeat within a template.</p>
      </div>
      <section aria-label="Attach Word document to report format" className="rounded-3xl border-2 border-dashed border-[#8dd7c9] bg-[#eafff7] p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#0d8476] shadow-sm">
            <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 17v3h16v-3M12 3v13m-5-5 5 5 5-5"/></svg>
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-[#17483f]">Attach your existing Word report</h2>
            <p className="mt-1 text-sm leading-6 text-[#40695f]">Choose the original Word (.docx) report for this template and format. We&apos;ll preserve its original design and let you connect names, amounts and property details with the fields above.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className={"inline-flex cursor-pointer items-center rounded-xl px-5 py-3 text-sm font-bold shadow-sm " + (allowed ? "bg-teal-700 text-white hover:bg-teal-800" : "pointer-events-none bg-slate-200 text-slate-500")}>
            {docx ? "Change attached Word file" : "Choose Word file (.docx)"}
            <input aria-label="Upload Word report" ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only" disabled={!allowed || busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}/>
          </label>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#31544e]">{filename ? "Original Word file: " + filename : "No Word document attached yet"}</span>
          <button type="button" disabled={!docx || !allowed || busy} className="cv-primary disabled:opacity-50" onClick={() => void save()}>{busy ? "Saving…" : formatId ? "Save changes" : "Create Report Format"}</button>
          <button type="button" disabled={!docx || busy} className="rounded-xl border border-[#afd9d2] bg-white px-4 py-3 text-sm font-semibold text-[#1e645f] disabled:opacity-50" onClick={() => void testDownload()}>Download sample .docx</button>
        </div>
        <p className="mt-3 text-xs text-[#5b7971]">After saving, you will be taken to the named report format with options to edit it or generate a report from a certificate. The original Word file is stored privately once.</p>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Word preview</h2>
            <span className="text-xs text-slate-600">Highlight text · Click an empty paragraph to insert</span>
          </div>
          <div className="max-h-[78vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-200 p-3 sm:p-6">
            <div ref={previewRef} onMouseUp={captureSelection}
              className="mx-auto min-h-[780px] max-w-[820px] select-text space-y-3 bg-white px-5 py-9 text-sm text-slate-900 shadow-md sm:px-12 sm:py-14">
              {!docx && <div className="p-8 text-center text-slate-400">Upload a Word report to see its paragraphs and tables here.</div>}
              {docx?.blocks.map((block, index) => block.kind === "paragraph"
                ? <WordParagraph key={index} paragraph={block.paragraph} bindings={bindings} selected={target?.paragraph === block.paragraph.index} onPick={clickParagraph}/>
                : <div key={index} className="overflow-x-auto"><table className="w-full border-collapse text-sm"><tbody>
                    {block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) =>
                      <td key={cellIndex} className="min-w-16 border border-slate-400 p-1.5 align-top">
                        {cell.map(p => <WordParagraph key={p.index} paragraph={p} bindings={bindings} selected={target?.paragraph === p.index} onPick={clickParagraph}/>)}
                      </td>
                    )}</tr>)}
                  </tbody></table></div>)}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-600">This visual mapping preview reproduces paragraphs and tables, but is not a pixel-perfect Microsoft Word renderer. The exported DOCX retains the original Word package, including its styles and images. Review each sample in Word before use.</p>
        </section>
        <aside className="space-y-4">
          <section className="cv-panel space-y-3 p-5">
            <h2 className="text-lg font-bold">1. Select &amp; link a field</h2>
            <div className="min-h-16 rounded-lg bg-slate-100 p-3 text-sm">
              {target ? <><span className="block text-xs text-slate-500">Selected text</span><strong className="break-words">{target.sample || "(insert)"}</strong></>
                : <span className="text-slate-500">Highlight Word text with your mouse. To fill an empty paragraph, click on it.</span>}
            </div>
            <label className="block text-sm font-semibold">2. Choose a certificate field
              <select className="cv-field mt-2" value={fieldId} onChange={event => setFieldId(event.target.value)}>
                <option value="">Select a field…</option>
                {fields.map(field => <option key={field.id} value={field.id}>{field.field_name} ({field.field_type})</option>)}
              </select>
            </label>
            <button disabled={!allowed || !target || !fieldId} onClick={addBinding} className="cv-primary w-full disabled:opacity-50">Link selected area to field</button>
            {fields.length === 0 && <p className="text-xs text-amber-800">First create fields on the certificate template page.</p>}
          </section>
          <section className="cv-panel space-y-3 p-5">
            <h2 className="font-bold">Mapped locations · {bindings.length}</h2>
            {bindings.length === 0 && <p className="text-sm text-slate-500">No field locations mapped yet.</p>}
            <div className="max-h-72 space-y-2 overflow-auto">{bindings.map((binding, index) => <div key={index} className="flex items-start justify-between gap-2 rounded-lg border border-teal-100 bg-teal-50 p-3">
              <div className="min-w-0 text-xs"><strong>{binding.fieldName}</strong><p className="mt-1 break-words text-slate-600">{docx?.paragraphs[binding.paragraph]?.text.slice(binding.start, binding.end) || "Empty paragraph"} · paragraph {binding.paragraph + 1}</p></div>
              {allowed && <button aria-label={"Remove mapping for " + binding.fieldName} className="rounded bg-white px-2 py-1 font-bold text-red-700" onClick={() => { setBindings(items => items.filter((_, i) => i !== index)); setDirty(true); }}>×</button>}
            </div>)}</div>
            <p className="text-xs text-slate-500">{mapped.size} of {fields.length} fields used. One field may appear in several locations.</p>
          </section>
          <section className="cv-panel space-y-3 p-5">
            <h2 className="font-bold">Try example data</h2>
            <p className="text-xs text-slate-500">Optional sample values for the Download sample button. Your template does not store these examples.</p>
            {fields.filter(field => mapped.has(field.id)).map(field =>
              <label key={field.id} className="block text-xs font-semibold">{field.field_name}
                <input className="cv-field mt-1" value={testValues[field.id] ?? ""} onChange={event => setTestValues(prev => ({ ...prev, [field.id]: event.target.value }))} placeholder="Example value"/>
              </label>)}
          </section>
        </aside>
      </div>
    </div>
  </main>;
}
