import { requireSelectedAccountId } from "@/lib/accounts/context";
import { supabase } from "@/lib/supabase";

export const WORD_REPORT_BUCKET = "certverify-word-formats";
export const WORD_REPORT_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const WORD_REPORT_MAX_BYTES = 4 * 1024 * 1024;

export type ReportFormat = {
  id: string;
  template_id: string;
  account_id: string;
  format_name: string;
  file_name: string;
  storage_path: string;
  bindings: import("@/lib/reports/docx-visual").ReportBinding[];
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keeping storage operations behind this boundary lets CertVerify replace the
 * file provider without changing the visual editor or report generator.
 * Storage permissions remain enforced by Supabase Storage RLS, not the UI.
 */
export function reportStoragePath(templateId: string, formatId: string) {
  const accountId = requireSelectedAccountId();
  if (!uuid.test(templateId) || !uuid.test(formatId)) throw new Error("Invalid report format or template ID.");
  return [accountId, templateId, formatId, crypto.randomUUID() + ".docx"].join("/");
}

export async function uploadWordOriginal(path: string, bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > WORD_REPORT_MAX_BYTES) {
    throw new Error("Word report file must be between 1 byte and 4 MB.");
  }
  const { error } = await supabase.storage.from(WORD_REPORT_BUCKET).upload(
    path,
    new Blob([bytes.slice().buffer as ArrayBuffer], { type: WORD_REPORT_MIME }),
    { upsert: false, cacheControl: "0", contentType: WORD_REPORT_MIME }
  );
  if (error) throw new Error("Cannot upload original Word format to private storage: " + error.message);
}

export async function downloadWordOriginal(path: string) {
  const accountId = requireSelectedAccountId();
  if (!path.startsWith(accountId + "/")) throw new Error("Report belongs to another workspace.");
  const { data, error } = await supabase.storage.from(WORD_REPORT_BUCKET).download(path);
  if (error || !data) throw new Error("Cannot read this private Word format. " + (error?.message ?? ""));
  if (data.size > WORD_REPORT_MAX_BYTES) throw new Error("Word report exceeds the maximum file size.");
  return new Uint8Array(await data.arrayBuffer());
}

export async function removeUncommittedWord(path: string) {
  const accountId = requireSelectedAccountId();
  if (!path.startsWith(accountId + "/")) return;
  // Database constraints prohibit deleting a Word object referenced by a format.
  await supabase.storage.from(WORD_REPORT_BUCKET).remove([path]);
}

export async function listReportFormats(templateId: string): Promise<ReportFormat[]> {
  const { data, error } = await supabase.from("cv_report_format_library")
    .select("id,template_id,account_id,format_name,file_name,storage_path,bindings")
    .eq("template_id", templateId)
    .order("format_name", { ascending: true });
  if (error) throw new Error("Could not load Word formats: " + error.message);
  return (data ?? []) as ReportFormat[];
}
