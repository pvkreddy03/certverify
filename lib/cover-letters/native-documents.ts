"use client";

import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import { publicVerificationUrl } from "@/lib/certificates/public-verification-url";
import { fillCoverText, validatePlacement, type CoverPlacement } from "@/lib/cover-letters/generator";

export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_PAGES = 30;
export type DocumentKind = "pdf" | "docx" | "jpg" | "png";
export const FILE_TYPES: Record<DocumentKind, string> = {
  pdf: PDF_MIME, docx: DOCX_MIME, jpg: "image/jpeg", png: "image/png",
};
export const extForKind = (kind: DocumentKind) => kind;
export function detectKind(file: Pick<Blob, "type"> & { name?: string }): DocumentKind {
  const name = (file.name ?? "").toLowerCase();
  if (name.endsWith(".pdf") && file.type === PDF_MIME) return "pdf";
  if (name.endsWith(".docx") && file.type === DOCX_MIME) return "docx";
  if (/\.jpe?g$/.test(name) && file.type === "image/jpeg") return "jpg";
  if (name.endsWith(".png") && file.type === "image/png") return "png";
  throw new Error("Use a PDF, Word .docx, JPG or PNG letterhead. Older .doc files must be saved as .docx.");
}
export async function inspectFile(file: File): Promise<DocumentKind> {
  const kind = detectKind(file);
  if (!file.size || file.size > MAX_FILE_BYTES) throw new Error("Document must be 12 MB or smaller.");
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const ok = kind === "pdf" ? String.fromCharCode(...b.slice(0, 5)) === "%PDF-" :
    kind === "docx" ? b[0] === 80 && b[1] === 75 && b[2] === 3 && b[3] === 4 :
    kind === "jpg" ? b[0] === 255 && b[1] === 216 && b[2] === 255 :
    b[0] === 137 && b[1] === 80 && b[2] === 78 && b[3] === 71;
  if (!ok) throw new Error("This file does not contain a valid " + kind.toUpperCase() + " header.");
  return kind;
}
async function canvasForImage(file: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("The image could not be opened."));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable.");
    context.drawImage(image, 0, 0);
    return canvas;
  } finally { URL.revokeObjectURL(url); }
}

export async function renderPdfPage(file: Blob, pageNumber = 1): Promise<HTMLCanvasElement> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const job = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await job.promise;
    if (pdf.numPages > MAX_PAGES) throw new Error("For safety, PDF files can contain at most 30 pages.");
    if (pageNumber > pdf.numPages) throw new Error("The requested PDF page does not exist.");
    const page = await pdf.getPage(pageNumber);
    const initial = page.getViewport({ scale: 1 });
    const scale = Math.min(2.5, 1280 / initial.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Cannot render PDF.");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return canvas;
  } finally { await job.destroy(); }
}
export async function renderWordPages(file: Blob): Promise<HTMLCanvasElement[]> {
  const { renderAsync } = await import("docx-preview");
  const { toCanvas } = await import("html-to-image");
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:850px;background:#fff;z-index:-1;pointer-events:none";
  document.body.appendChild(host);
  try {
    // Never run embedded HTML chunks from a client-owned document.
    await renderAsync(file, host, host, {
      breakPages: true, ignoreLastRenderedPageBreak: false,
      renderHeaders: true, renderFooters: true, renderAltChunks: false,
      renderComments: false, inWrapper: true,
    });
    await document.fonts.ready;
    const sections = Array.from(host.querySelectorAll<HTMLElement>("section.docx"));
    if (sections.length === 0) throw new Error("Word preview could not find a printable page.");
    if (sections.length > MAX_PAGES) throw new Error("Word document is more than 30 pages.");
    const result: HTMLCanvasElement[] = [];
    for (const section of sections) {
      // Some legitimate Word files (e.g. old letterheads and minimal DOCX files)
      // have no explicit page dimensions. The HTML element can be only a few
      // lines high; pad that page to A4 instead of rejecting or stretching it.
      let bounds = section.getBoundingClientRect();
      if (bounds.width < 500) section.style.width = "794px";
      bounds = section.getBoundingClientRect();
      const desiredHeight = bounds.width * 297 / 210;
      if (bounds.height < desiredHeight) section.style.minHeight = desiredHeight + "px";
      section.style.backgroundColor = "#ffffff";
      bounds = section.getBoundingClientRect();
      if (bounds.width < 500 || bounds.height < 600) throw new Error("Word page dimensions are invalid.");
      const bitmap = await toCanvas(section, {
        pixelRatio: Math.min(2, 1500 / bounds.width), backgroundColor: "#ffffff",
        cacheBust: false, skipFonts: false,
      });
      result.push(bitmap);
    }
    return result;
  } catch (error) {
    throw new Error("Unable to render this Word layout faithfully. " +
      (error instanceof Error ? error.message : String(error)));
  } finally { host.remove(); }
}
export async function previewFirstPage(file: Blob, kind: DocumentKind): Promise<HTMLCanvasElement> {
  if (kind === "pdf") return renderPdfPage(file);
  if (kind === "docx") return (await renderWordPages(file))[0];
  return canvasForImage(file);
}

function textCanvas(text: string, width: number, height: number, p: CoverPlacement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(700, Math.round(width * 2));
  canvas.height = Math.max(900, Math.round(height * 2));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Text rendering unavailable.");
  const scale = canvas.width / width;
  const fontSize = Math.max(9, width * 0.0175) * scale;
  const lineHeight = fontSize * 1.45;
  ctx.font = fontSize + "px Arial, sans-serif";
  ctx.fillStyle = "#172933";
  ctx.textBaseline = "top";
  const max = p.text_width * canvas.width;
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of paragraph.trim().split(/\s+/)) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width <= max) line = next;
      else {
        if (line) lines.push(line);
        if (ctx.measureText(word).width > max) throw new Error("Letter has a word wider than the text box.");
        line = word;
      }
    }
    lines.push(line);
  }
  if (lines.length * lineHeight > p.text_height * canvas.height) throw new Error("Letter is too long for the text box. Move or enlarge the box, or shorten the letter.");
  lines.forEach((line, idx) => ctx.fillText(line, p.text_x * canvas.width, p.text_y * canvas.height + idx * lineHeight));
  return canvas;
}
async function overlay(pdf: PDFDocument, text: string, verificationId: string, placement: CoverPlacement) {
  validatePlacement(placement);
  const page = pdf.getPages()[0];
  if (!page) throw new Error("Document must have at least one page.");
  const { width, height } = page.getSize();
  const verification = publicVerificationUrl(verificationId, window.location.origin);
  const qrBytes = await fetch(await QRCode.toDataURL(verification, { width: 900, margin: 2, errorCorrectionLevel: "M" })).then(r => r.arrayBuffer());
  const qr = await pdf.embedPng(qrBytes);
  const qrWidth = placement.qr_size * width;
  page.drawImage(qr, {
    x: placement.qr_x * width, y: height - placement.qr_y * height - qrWidth,
    width: qrWidth, height: qrWidth,
  });
  if (text.trim()) {
    const canvas = textCanvas(text, width, height, placement);
    const layer = await pdf.embedPng(canvas.toDataURL("image/png"));
    page.drawImage(layer, { x: 0, y: 0, width, height });
  }
}
async function asPdf(file: Blob, kind: DocumentKind): Promise<PDFDocument> {
  if (kind === "pdf") {
    try {
      const result = await PDFDocument.load(await file.arrayBuffer());
      if (result.getPageCount() > MAX_PAGES) throw new Error("PDF must be 30 pages or fewer.");
      return result;
    } catch (error) { throw new Error("Could not open this PDF. Password-protected or damaged PDFs are unsupported. " + String(error)); }
  }
  const canvases = kind === "docx" ? await renderWordPages(file) : [await canvasForImage(file)];
  const pdf = await PDFDocument.create();
  for (const canvas of canvases) await appendCanvasPage(pdf, canvas);
  return pdf;
}
async function appendCanvasPage(pdf: PDFDocument, canvas: HTMLCanvasElement) {
  const width = 595.28;
  const height = 841.89;
  const embedded = await pdf.embedJpg(canvas.toDataURL("image/jpeg", 0.9));
  const page = pdf.addPage([width, height]);
  page.drawImage(embedded, { x: 0, y: 0, width, height });
}
export async function createPrintableDocument(args: {
  background: Blob; kind: DocumentKind; verificationId: string;
  body: string; placement: CoverPlacement; report?: Blob | null;
}): Promise<Blob> {
  const pdf = await asPdf(args.background, args.kind);
  await overlay(pdf, args.body, args.verificationId, args.placement);
  if (args.report) {
    const canvases = await renderWordPages(args.report);
    if (pdf.getPageCount() + canvases.length > MAX_PAGES) throw new Error("Combined PDF exceeds 30 pages.");
    for (const canvas of canvases) await appendCanvasPage(pdf, canvas);
  }
  const raw = await pdf.save();
  return new Blob([raw.slice().buffer as ArrayBuffer], { type: PDF_MIME });
}

export { fillCoverText };
