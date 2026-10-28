"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import {
  base64ToBytes, downloadReport, fileToBase64, generateWordReport, openWordDocument,
  validateBindings, type ReportBinding, type ReportParagraph, type VisualDocx,
} from "@/lib/reports/docx-visual";

type Field = { id: string; field_name: string; field_type: string };
type Target = { paragraph: number; start: number; end: number; sample: string };
type StoredFormat = { template_id: string; file_name: string; docx_base64: string; bindings: ReportBinding[] };

function WordParagraph({
  paragraph, bindings, selected, onPick,
}: {
  paragraph: ReportParagraph; bindings: ReportBinding[]; selected: boolean;
  onPick: (paragraph: number) => void;
}) {
  let offset = 0;
  const parts = paragraph.runs.flatMap((run, runIndex) => {
    const start = offset;
    offset += run.text.length;
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
  const [docx, setDocx] = useState<VisualDocx | null>(null);
  const [filename, setFilename] = useState("");
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
      const [template, member, fieldResult, saved] = await Promise.all([
        supabase.from("certificate_templates").select("id,user_id,account_id").eq("id", id).single(),
        supabase.from("account_members").select("role,can_manage_templates").eq("account_id", accountId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
        supabase.from("certificate_fields").select("id,field_name,field_type").eq("template_id", id).order("display_order"),
        supabase.from("cv_report_formats").select("template_id,file_name,docx_base64,bindings").eq("template_id", id).maybeSingle(),
      ]);
      if (template.error) throw new Error("You cannot access this certificate template.");
      if (fieldResult.error) throw new Error(fieldResult.error.message);
      if (saved.error) throw new Error("Report-format storage is not ready. The report migration must be applied to this environment.");
      const canEdit = !!member.data && (
        member.data.role === "owner" || member.data.role === "admin" ||
        (member.data.role === "member" && member.data.can_manage_templates && template.data.user_id === user.id)
      );
      setAllowed(canEdit);
      setFields(fieldResult.data ?? []);
      if (saved.data) {
        const record = saved.data as StoredFormat;
        const parsed = await openWordDocument(base64ToBytes(record.docx_base64));
        const mapping = Array.isArray(record.bindings) ? record.bindings : [];
        validateBindings(mapping, parsed.paragraphs);
        setDocx(parsed); setFilename(record.file_name); setBindings(mapping);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open report designer.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function upload(file: File) {
    setMessage("");
    if (!/\.docx$/i.test(file.name)) { setMessage("Upload a .docx file (not .doc or a PDF)."); return; }
    setBusy(true);
    try {
      const parsed = await openWordDocument(new Uint8Array(await file.arrayBuffer()));
      setDocx(parsed); setFilename(file.name); setBindings([]); setTarget(null);
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

  async function save() {
    if (!docx || !allowed) return;
    setBusy(true); setMessage("");
    try {
      validateBindings(bindings, docx.paragraphs);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Session expired. Log in again.");
      const { error } = await supabase.from("cv_report_formats").upsert({
        template_id: id, account_id: requireSelectedAccountId(), created_by: user.id,
        file_name: filename, docx_base64: fileToBase64(docx.bytes), bindings,
      }, { onConflict: "template_id" });
      if (error) throw new Error("Could not save report format. " + error.message);
      setDirty(false); setMessage("Report format and its visual field mappings saved successfully.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save Word report."); }
    finally { setBusy(false); }
  }

  async function testDownload() {
    if (!docx) return;
    setBusy(true); setMessage("");
    try {
      const values: Record<string, string> = {};
      for (const field of fields) values[field.field_name] = testValues[field.id] || "[" + field.field_name + "]";
      const result = await generateWordReport(docx, bindings, values);
      downloadReport(result, "Sample-" + filename);
      setMessage("Sample generated. Open it in Word to review pagination, tables and formatting.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not generate sample."); }
    finally { setBusy(false); }
  }

  const mapped = useMemo(() => new Set(bindings.map(binding => binding.fieldId)), [bindings]);

  if (loading) return <main className="cv-page"><div className="cv-shell p-8">Loading Word report designer…</div></main>;
  return <main className="cv-page">
    <div className="cv-shell space-y-5 pb-12">
      <Link href={"/dashboard/templates/" + id} className="text-sm font-semibold text-teal-800 underline">← Back to Certificate Template</Link>
      <div className="cv-hero"><div className="cv-hero__body">
        <p className="cv-eyebrow mb-2">VISUAL WORD REPORT DESIGNER</p>
        <h1 className="text-3xl font-bold text-white">Build a report without placeholders</h1>
        <p className="mt-2 text-slate-200">Upload your existing Word report. Highlight a name, number or other text and link it to a certificate field. Reuse the same field in as many locations as needed.</p>
      </div></div>
      {message && <p role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800">{message}</p>}
      {!allowed && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">Only the template owner, authorized template editor or account administrator can change this report format.</p>}
      <div className="cv-panel flex flex-wrap items-center gap-3 p-4">
        <label className={"cursor-pointer rounded-lg px-4 py-3 font-semibold " + (allowed ? "bg-teal-700 text-white" : "pointer-events-none bg-slate-200 text-slate-500")}>
          {docx ? "Replace Word file" : "Upload Word .docx"}
          <input aria-label="Upload Word report" ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only" disabled={!allowed || busy} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); }}/>
        </label>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-600">{filename || "No report attached yet"}</span>
        <button disabled={!docx || !allowed || busy} className="cv-primary disabled:opacity-50" onClick={() => void save()}>{busy ? "Working…" : dirty ? "Save report format *" : "Save report format"}</button>
        <button disabled={!docx || busy} className="rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold disabled:opacity-50" onClick={() => void testDownload()}>Download sample .docx</button>
      </div>
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
