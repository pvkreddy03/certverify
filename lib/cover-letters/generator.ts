import QRCode from "qrcode";
import { publicVerificationUrl } from "@/lib/certificates/public-verification-url";

export type CoverPlacement = {
  qr_x: number; qr_y: number; qr_size: number;
  text_x: number; text_y: number; text_width: number; text_height: number;
};
export const DEFAULT_PLACEMENT: CoverPlacement = {
  qr_x: 0.79, qr_y: 0.78, qr_size: 0.16,
  text_x: 0.13, text_y: 0.28, text_width: 0.72, text_height: 0.42,
};
export const DEFAULT_BODY = "Date: {{Date}}\nRef: {{Certificate Number}}\n\nTo,\n{{Client Name}}\n\nSubject: {{Subject}}\n\n{{Description}}\n\nRegards,\nAuthorized Signatory";

export function fillCoverText(template: string, fields: Record<string, string>): string {
  const normalized = new Map(Object.entries(fields).map(([key, value]) => [key.trim().toLowerCase(), value]));
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, field: string) =>
    normalized.get(field.trim().toLowerCase()) ?? "");
}
export function validatePlacement(value: CoverPlacement): void {
  const entries = Object.entries(value);
  if (entries.some(([, number]) => !Number.isFinite(number) || number < 0 || number > 1)) {
    throw new Error("Letter placement must remain inside the page.");
  }
  if (value.qr_size < 0.085 || value.qr_x + value.qr_size > 1 || value.qr_y + value.qr_size > 1) {
    throw new Error("QR code must fit on the page and remain large enough to scan.");
  }
  if (value.text_width < 0.15 || value.text_height < 0.12 ||
      value.text_x + value.text_width > 1 || value.text_y + value.text_height > 1) {
    throw new Error("Text area must fit inside the page.");
  }
}
function imageFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not display the uploaded letterhead image."));
    image.src = src;
  });
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph) { lines.push(""); continue; }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? current + " " + word : word;
      if (ctx.measureText(candidate).width <= maxWidth) { current = candidate; continue; }
      if (current) { lines.push(current); current = ""; }
      if (ctx.measureText(word).width > maxWidth) {
        throw new Error("A word is too long for the selected text area. Increase its width.");
      }
      current = word;
    }
    lines.push(current);
  }
  return lines;
}
export async function renderCoverPage(params: {
  background: Blob;
  verificationId: string;
  body: string;
  position: CoverPlacement;
}): Promise<HTMLCanvasElement> {
  validatePlacement(params.position);
  if (!params.verificationId) throw new Error("Choose an issued certificate with a verification ID.");
  const objectUrl = URL.createObjectURL(params.background);
  try {
    const background = await imageFromUrl(objectUrl);
    const ratio = background.naturalHeight / background.naturalWidth;
    if (ratio < 1.15 || ratio > 1.65) throw new Error("Choose a portrait letterhead page, preferably A4.");
    // At 180dpi this remains high-resolution enough for A4 print and QR scanners.
    const canvas = document.createElement("canvas");
    canvas.width = 1490;
    canvas.height = Math.round(canvas.width * ratio);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser cannot prepare the letterhead.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(background, 0, 0, canvas.width, canvas.height);
    const p = params.position;
    const qrPixels = Math.round(p.qr_size * canvas.width);
    const qrUrl = publicVerificationUrl(params.verificationId, window.location.origin);
    const qrData = await QRCode.toDataURL(qrUrl, { width: qrPixels, margin: 2, errorCorrectionLevel: "M" });
    const qr = await imageFromUrl(qrData);
    context.fillStyle = "#ffffff";
    context.fillRect(Math.round(p.qr_x * canvas.width), Math.round(p.qr_y * canvas.height), qrPixels, qrPixels);
    context.drawImage(qr, Math.round(p.qr_x * canvas.width), Math.round(p.qr_y * canvas.height), qrPixels, qrPixels);
    context.fillStyle = "#192d38";
    const fontPx = Math.round(canvas.width * 0.018);
    context.font = fontPx + "px Arial, sans-serif";
    context.textBaseline = "top";
    const lines = wrapText(context, params.body, p.text_width * canvas.width);
    const lineHeight = Math.round(fontPx * 1.5);
    if (lines.length * lineHeight > p.text_height * canvas.height) {
      throw new Error("Text does not fit. Shorten the letter or increase the text area before downloading.");
    }
    lines.forEach((line, index) => context.fillText(line, p.text_x * canvas.width, p.text_y * canvas.height + index * lineHeight));
    return canvas;
  } finally { URL.revokeObjectURL(objectUrl); }
}
const latin = (value: string) => new TextEncoder().encode(value);
export function canvasToPdf(canvas: HTMLCanvasElement): Blob {
  // Single-page PDF with a high-resolution JPEG XObject. No remote PDF service,
  // no third-party document upload and no generated document retention.
  const base64 = canvas.toDataURL("image/jpeg", 0.95).split(",")[1];
  const raw = atob(base64);
  const jpeg = Uint8Array.from(raw, char => char.charCodeAt(0));
  const content = latin("q 595.28 0 0 841.89 0 0 cm /Im0 Do Q\n");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const append = (chunk: Uint8Array) => { chunks.push(chunk); length += chunk.length; };
  const write = (value: string) => append(latin(value));
  const offsets: number[] = [0];
  write("%PDF-1.4\n");
  const object = (id: number, text: string) => {
    offsets[id] = length;
    write(String(id) + " 0 obj\n" + text + "\nendobj\n");
  };
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>");
  offsets[4] = length;
  write("4 0 obj\n<< /Length " + String(content.length) + " >>\nstream\n");
  append(content);
  write("endstream\nendobj\n");
  offsets[5] = length;
  write("5 0 obj\n<< /Type /XObject /Subtype /Image /Width " + String(canvas.width) +
    " /Height " + String(canvas.height) + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " +
    String(jpeg.length) + " >>\nstream\n");
  append(jpeg);
  write("\nendstream\nendobj\n");
  const xref = length;
  write("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id++) write(String(offsets[id]).padStart(10, "0") + " 00000 n \n");
  write("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + String(xref) + "\n%%EOF");
  return new Blob(chunks.map(chunk => chunk.slice().buffer as ArrayBuffer), { type: "application/pdf" });
}
export function savePdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename.replace(/[^a-z0-9 _.-]/gi, "_").slice(0, 180) + ".pdf";
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
