import { createXlsxWorkbook, zipFiles, WorkbookError } from "../bulk/xlsx";
import {parseGeoLocation} from "../geo/location";

export type ExportCertificate = {
  id: string;
  certificate_id: string;
  template_id: string | null;
  template_name: string | null;
  public_verification_id: string | null;
  status: string;
  created_at: string;
  user_id: string;
};
export type ExportValue = {
  certificate_id: string;
  field_name: string;
  field_type: string;
  field_value: string | null;
  display_order: number;
};

const STANDARD_HEADERS = [
  "Certificate ID", "Status", "Created At (IST)", "Created By",
  "Verification URL", "Template",
];
const MAX_WORKBOOK_SHEETS = 30;
const MAX_SHEET_COLUMNS = 100;

function sheetName(name: string, taken: Set<string>) {
  const base = (name.replace(/[\\/:*?\[\]\u0000-\u001f]/g, " ").replace(/^'+|'+$/g, "").trim() || "Untitled template").slice(0, 31);
  let candidate = base, i = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = " (" + i++ + ")";
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

function formatIST(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).format(date);
}

type Sheet = { name: string; headers: string[]; rows: string[][] };

/** Preserves stored certificate snapshots, including private custom fields for authorized owners. */
export function buildCertificateExportSheets(
  certificates: ExportCertificate[],
  values: ExportValue[],
  creators: Map<string, string>,
  verifyUrl: (reference: string) => string,
): Sheet[] {
  const byCertificate = new Map<string, ExportValue[]>();
  for (const value of values) {
    const list = byCertificate.get(value.certificate_id) ?? [];
    list.push(value);
    byCertificate.set(value.certificate_id, list);
  }
  const groups = new Map<string, ExportCertificate[]>();
  for (const certificate of certificates) {
    const key = certificate.template_id ?? "legacy:" + (certificate.template_name?.trim() || "unassigned");
    const list = groups.get(key) ?? [];
    list.push(certificate);
    groups.set(key, list);
  }
  const taken = new Set<string>();
  const sheets: Sheet[] = [];
  for (const group of groups.values()) {
    const label = group[0]?.template_name?.trim() || "No template";
    const sheet = sheetName(label, taken);
    const fields = new Map<string, number>();
    for (const certificate of group) {
      for (const field of byCertificate.get(certificate.id) ?? []) {
        if (!fields.has(field.field_name)) fields.set(field.field_name, field.display_order);
      }
    }
    const names = [...fields.keys()].sort((a, b) =>
      (fields.get(a)! - fields.get(b)!) || a.localeCompare(b));
    if (names.length + STANDARD_HEADERS.length > MAX_SHEET_COLUMNS) {
      throw new WorkbookError("Template " + label + " contains too many fields for one Excel sheet.");
    }
    const headers = [...STANDARD_HEADERS, ...names.map((name, index) =>
      STANDARD_HEADERS.includes(name) || names.indexOf(name) !== index ? name + " (field)" : name)];
    const rows = group.map((certificate) => {
      const fieldsForCertificate = new Map<string, string>();
      for (const value of byCertificate.get(certificate.id) ?? []) {
        const geo=value.field_type==="location"?parseGeoLocation(value.field_value):null;
        fieldsForCertificate.set(value.field_name,geo?geo.lat.toFixed(6)+", "+geo.lng.toFixed(6):value.field_value??"");
      }
      return [
        certificate.certificate_id,
        certificate.status,
        formatIST(certificate.created_at),
        creators.get(certificate.user_id) || certificate.user_id,
        certificate.public_verification_id ? verifyUrl(certificate.public_verification_id) : "",
        certificate.template_name || "",
        ...names.map((name) => fieldsForCertificate.get(name) ?? ""),
      ];
    });
    sheets.push({ name: sheet, headers, rows });
  }
  return sheets;
}

export function packageCertificateExport(sheets: Sheet[]) {
  if (!sheets.length) throw new WorkbookError("No certificates found for the selected date range.");
  if (sheets.length <= MAX_WORKBOOK_SHEETS) {
    return {
      bytes: createXlsxWorkbook(sheets),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }
  const entries = [];
  for (let i = 0; i < sheets.length; i += MAX_WORKBOOK_SHEETS) {
    entries.push({
      name: "certificates-part-" + String(Math.floor(i / MAX_WORKBOOK_SHEETS) + 1).padStart(3, "0") + ".xlsx",
      bytes: createXlsxWorkbook(sheets.slice(i, i + MAX_WORKBOOK_SHEETS)),
    });
  }
  return { bytes: zipFiles(entries), contentType: "application/zip", extension: "zip" };
}

export function parseExportDates(start: unknown, end: unknown) {
  const valid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
  };
  if ((start !== undefined && start !== "" && (typeof start !== "string" || !valid(start))) ||
      (end !== undefined && end !== "" && (typeof end !== "string" || !valid(end)))) {
    throw new WorkbookError("Enter valid start and end dates in YYYY-MM-DD format.");
  }
  const from = typeof start === "string" && start ? start : null;
  const to = typeof end === "string" && end ? end : null;
  if (from && to && from > to) throw new WorkbookError("End date must be on or after start date.");
  // Dates are interpreted as calendar dates in India, end inclusive.
  const begin = from ? new Date(from + "T00:00:00+05:30").toISOString() : null;
  const after = to ? new Date(new Date(to + "T00:00:00+05:30").getTime() + 86_400_000).toISOString() : null;
  return { begin, after, from, to };
}
