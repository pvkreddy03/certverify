import { safeReportFileName } from "@/lib/reports/report-filenames";

/**
 * Browser-side, no third-party execution: DOCX is an OOXML ZIP archive.
 * Visual selections are recorded by paragraph and character offset, not by
 * fragile text-search placeholders. The original DOCX stays immutable.
 * Unchanged ZIP entries (images, styles, relationships) are copied verbatim.
 */
const WORD = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const ZIP_MAX_FILES = 650;
const XML_LIMIT = 12 * 1024 * 1024;

export type ReportBinding = {
  paragraph: number;
  start: number;
  end: number;
  fieldId: string;
  fieldName: string;
};

export type ReportRun = { text: string; bold: boolean; italic: boolean; underline: boolean };
export type ReportParagraph = { index: number; runs: ReportRun[]; align: string; heading: boolean; text: string };
export type ReportBlock =
  | { kind: "paragraph"; paragraph: ReportParagraph }
  | { kind: "table"; rows: ReportParagraph[][][] };

type Entry = { name: string; data: Uint8Array; crc: number; plainSize: number; method: number };
export type VisualDocx = { bytes: Uint8Array; entries: Entry[]; xml: Document; blocks: ReportBlock[]; paragraphs: ReportParagraph[] };

function read32(view: DataView, offset: number) { return view.getUint32(offset, true); }
function read16(view: DataView, offset: number) { return view.getUint16(offset, true); }
function put16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function put32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function zipEntries(bytes: Uint8Array): Entry[] {
  if (bytes.byteLength < 22) throw new Error("This is not a DOCX ZIP file.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (read32(view, i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("Invalid Word file: ZIP footer is missing.");
  const count = read16(view, end + 10);
  if (count > ZIP_MAX_FILES || read16(view, end + 8) !== count) throw new Error("Word file contains too many parts.");
  let offset = read32(view, end + 16);
  const result: Entry[] = [];
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || read32(view, offset) !== 0x02014b50) throw new Error("Invalid Word archive directory.");
    const flags = read16(view, offset + 8), method = read16(view, offset + 10);
    const crc = read32(view, offset + 16), compressedSize = read32(view, offset + 20);
    const plainSize = read32(view, offset + 24);
    const nameLength = read16(view, offset + 28), extraLength = read16(view, offset + 30);
    const commentLength = read16(view, offset + 32), localOffset = read32(view, offset + 42);
    if (flags & 1 || ![0, 8].includes(method) || compressedSize === 0xffffffff || plainSize === 0xffffffff) {
      throw new Error("Unsupported or encrypted Word document.");
    }
    total += plainSize;
    if (total > 48 * 1024 * 1024 || plainSize > XML_LIMIT && /[.]xml$/.test(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)))) {
      throw new Error("Word file is too large to process safely.");
    }
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > bytes.length || localOffset + 30 > bytes.length || read32(view, localOffset) !== 0x04034b50) throw new Error("Damaged Word ZIP entry.");
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const contentOffset = localOffset + 30 + read16(view, localOffset + 26) + read16(view, localOffset + 28);
    if (contentOffset + compressedSize > bytes.length) throw new Error("Damaged Word ZIP contents.");
    result.push({ name, method, crc, plainSize, data: bytes.slice(contentOffset, contentOffset + compressedSize) });
    offset = next;
  }
  return result;
}

async function inflate(entry: Entry): Promise<Uint8Array> {
  if (entry.method === 0) return entry.data.slice();
  if (!("DecompressionStream" in window)) throw new Error("Update your browser to open Word reports.");
  const stream = new Blob([entry.data.slice().buffer as ArrayBuffer]).stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const result = new Uint8Array(await new Response(stream).arrayBuffer());
  if (result.length !== entry.plainSize) throw new Error("Damaged Word file.");
  return result;
}

function wordChildren(element: Element, local: string): Element[] {
  return Array.from(element.children).filter(child => child.namespaceURI === WORD && child.localName === local);
}
function descendants(element: Element, local: string): Element[] {
  return Array.from(element.getElementsByTagNameNS(WORD, local));
}
function textNodes(paragraph: Element): Element[] { return descendants(paragraph, "t"); }
function paragraphText(paragraph: Element) { return textNodes(paragraph).map(node => node.textContent ?? "").join(""); }
function paragraphStyle(paragraph: Element) {
  const properties = wordChildren(paragraph, "pPr")[0];
  const alignment = properties ? wordChildren(properties, "jc")[0]?.getAttributeNS(WORD, "val") : null;
  const style = properties ? wordChildren(properties, "pStyle")[0]?.getAttributeNS(WORD, "val") : null;
  return { align: alignment || "left", heading: /^heading|^title/i.test(style || "") };
}

function visualParagraph(p: Element, index: number): ReportParagraph {
  const { align, heading } = paragraphStyle(p);
  const runs: ReportRun[] = [];
  const textElements = textNodes(p);
  for (const text of textElements) {
    const run = text.closest("w\\:r") || text.parentElement;
    // querySelector cannot match a namespaced element consistently across browsers;
    // the closest OOXML run is found by walking parents instead.
    let node: Element | null = text;
    while (node && !(node.namespaceURI === WORD && node.localName === "r")) node = node.parentElement;
    const rPr = node ? wordChildren(node, "rPr")[0] : null;
    const enabled = (tag: string) => {
      if (!rPr) return false;
      const el = wordChildren(rPr, tag)[0];
      return !!el && el.getAttributeNS(WORD, "val") !== "0" && el.getAttributeNS(WORD, "val") !== "false";
    };
    void run;
    runs.push({ text: text.textContent ?? "", bold: enabled("b"), italic: enabled("i"), underline: enabled("u") });
  }
  return { index, runs, text: runs.map(r => r.text).join(""), align, heading };
}

function collectStructure(xml: Document) {
  const body = xml.getElementsByTagNameNS(WORD, "body")[0];
  if (!body) throw new Error("Word document has no body.");
  const all = descendants(body, "p");
  const byNode = new Map<Element, ReportParagraph>();
  const paragraphs = all.map((p, index) => {
    const result = visualParagraph(p, index);
    byNode.set(p, result);
    return result;
  });
  function tableRows(table: Element): ReportParagraph[][][] {
    return wordChildren(table, "tr").map(row =>
      wordChildren(row, "tc").map(cell => {
        const blocks = Array.from(cell.children);
        return blocks.flatMap(child => {
          if (child.namespaceURI !== WORD) return [];
          if (child.localName === "p") return [byNode.get(child)!];
          if (child.localName === "tbl") return descendants(child, "p").map(p => byNode.get(p)!);
          return [];
        });
      }));
  }
  const blocks: ReportBlock[] = [];
  for (const child of Array.from(body.children)) {
    if (child.namespaceURI !== WORD) continue;
    if (child.localName === "p") blocks.push({ kind: "paragraph", paragraph: byNode.get(child)! });
    if (child.localName === "tbl") blocks.push({ kind: "table", rows: tableRows(child) });
  }
  return { blocks, paragraphs };
}

export async function openWordDocument(bytes: Uint8Array): Promise<VisualDocx> {
  if (bytes.byteLength > 4 * 1024 * 1024) throw new Error("Word file must be 4 MB or smaller in this first release.");
  const entries = zipEntries(bytes);
  if (!entries.some(entry => entry.name === "[Content_Types].xml")) throw new Error("Choose a .docx Word document.");
  const word = entries.find(entry => entry.name === "word/document.xml");
  if (!word) throw new Error("Word file is missing its document content.");
  const source = decoder.decode(await inflate(word));
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error("This Word file contains unsupported XML declarations.");
  const xml = new DOMParser().parseFromString(source, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error("Word document contains invalid XML.");
  const { blocks, paragraphs } = collectStructure(xml);
  return { bytes, entries, xml, blocks, paragraphs };
}

export function validateBindings(bindings: ReportBinding[], paragraphs: ReportParagraph[]) {
  for (const binding of bindings) {
    const p = paragraphs[binding.paragraph];
    if (!p || !Number.isInteger(binding.start) || !Number.isInteger(binding.end)
      || binding.start < 0 || binding.end < binding.start || binding.end > p.text.length
      || !binding.fieldName.trim() || !binding.fieldId.trim()) throw new Error("A report field mapping is invalid.");
  }
  for (let i = 0; i < bindings.length; i++) for (let j = i + 1; j < bindings.length; j++) {
    const a = bindings[i], b = bindings[j];
    if (a.paragraph !== b.paragraph) continue;
    if (a.start === a.end && a.start === b.start && b.start === b.end) throw new Error("Two fields share the same insertion point.");
    if (a.start < b.end && b.start < a.end) throw new Error("Report fields overlap. Remove one of the mappings.");
  }
}

function writeRange(p: Element, start: number, end: number, value: string) {
  const nodes = textNodes(p);
  if (nodes.length === 0) {
    if (start !== 0 || end !== 0) throw new Error("Report paragraph changed after mapping.");
    const run = p.ownerDocument.createElementNS(WORD, "w:r");
    const text = p.ownerDocument.createElementNS(WORD, "w:t");
    text.setAttribute("xml:space", "preserve");
    text.textContent = value; run.appendChild(text); p.appendChild(run);
    return;
  }
  const pieces: Array<{ node: Element; left: number; right: number; text: string }> = [];
  let position = 0;
  for (const node of nodes) {
    const content = node.textContent ?? "";
    pieces.push({ node, left: position, right: position + content.length, text: content });
    position += content.length;
  }
  if (end > position) throw new Error("Report template content changed since mapping.");
  // Work right-to-left, always preserving original style of the first affected run.
  if (start === end) {
    const target = pieces.find(part => start <= part.right) || pieces[pieces.length - 1];
    const i = start - target.left;
    target.node.textContent = target.text.slice(0, i) + value + target.text.slice(i);
    target.node.setAttribute("xml:space", "preserve");
    return;
  }
  const affected = pieces.filter(part => part.right > start && part.left < end);
  const first = affected[0], last = affected[affected.length - 1];
  if (!first || !last) throw new Error("Could not locate the selected Word text.");
  if (first === last) {
    first.node.textContent = first.text.slice(0, start - first.left) + value + first.text.slice(end - first.left);
  } else {
    first.node.textContent = first.text.slice(0, start - first.left) + value;
    for (const middle of affected.slice(1, -1)) middle.node.textContent = "";
    last.node.textContent = last.text.slice(end - last.left);
  }
  first.node.setAttribute("xml:space", "preserve");
  last.node.setAttribute("xml:space", "preserve");
}

const table = (() => {
  const items = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    items[i] = crc >>> 0;
  }
  return items;
})();
function checksum(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries: Entry[]) {
  const segments: Uint8Array[] = [], directory: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    put32(l, 0, 0x04034b50); put16(l, 4, 20); put16(l, 6, 0x0800);
    put16(l, 8, entry.method); put32(l, 14, entry.crc); put32(l, 18, entry.data.length);
    put32(l, 22, entry.plainSize); put16(l, 26, name.length);
    local.set(name, 30);
    segments.push(local, entry.data);
    const central = new Uint8Array(46 + name.length);
    const c = new DataView(central.buffer);
    put32(c, 0, 0x02014b50); put16(c, 4, 20); put16(c, 6, 20);
    put16(c, 8, 0x0800); put16(c, 10, entry.method); put32(c, 16, entry.crc);
    put32(c, 20, entry.data.length); put32(c, 24, entry.plainSize);
    put16(c, 28, name.length); put32(c, 42, offset);
    central.set(name, 46);
    directory.push(central);
    offset += local.length + entry.data.length;
  }
  const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), d = new DataView(end.buffer);
  put32(d, 0, 0x06054b50); put16(d, 8, entries.length); put16(d, 10, entries.length);
  put32(d, 12, directorySize); put32(d, 16, offset);
  const blobs: BlobPart[] = [...segments, ...directory, end].map(part => part.slice().buffer as ArrayBuffer);
  return new Blob(blobs, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export async function generateWordReport(file: VisualDocx, bindings: ReportBinding[], values: Record<string, string>): Promise<Blob> {
  validateBindings(bindings, file.paragraphs);
  const xml = new DOMParser().parseFromString(new XMLSerializer().serializeToString(file.xml), "application/xml");
  const paragraphs = Array.from(xml.getElementsByTagNameNS(WORD, "body")[0].getElementsByTagNameNS(WORD, "p"));
  const groups = new Map<number, ReportBinding[]>();
  for (const b of bindings) groups.set(b.paragraph, [...(groups.get(b.paragraph) ?? []), b]);
  for (const [index, group] of groups) {
    const p = paragraphs[index];
    if (!p || paragraphText(p) !== file.paragraphs[index].text) throw new Error("The report format has changed. Reopen and save the mapping.");
    for (const item of [...group].sort((a, b) => b.start - a.start)) writeRange(p, item.start, item.end, values[item.fieldName] ?? "");
  }
  const changed = encoder.encode(new XMLSerializer().serializeToString(xml));
  const output = file.entries.map(entry => entry.name !== "word/document.xml" ? entry : {
    name: entry.name, data: changed, crc: checksum(changed), plainSize: changed.length, method: 0,
  });
  return makeZip(output);
}

export function fileToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function base64ToBytes(value: string) {
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
export function downloadReport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = safeReportFileName(filename, 180);
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
