import { requireSelectedAccountId } from "@/lib/accounts/context";
import { supabase } from "@/lib/supabase";

const BUCKET = "certverify-saved-covers";
const MAX_BYTES = 25 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Private, immutable PDF snapshots. Generated documents are uploaded only after confirmation. */
export function savedCoverPath(id: string, userId: string) {
  if (!uuid.test(id) || !uuid.test(userId)) throw new Error("Invalid cover letter identifier.");
  return [requireSelectedAccountId(), userId, id + ".pdf"].join("/");
}
function checkPath(path: string) {
  if (!path.startsWith(requireSelectedAccountId() + "/") ||
      !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i.test(path)) {
    throw new Error("Cover letter is outside the current workspace.");
  }
}
export async function uploadSavedCover(path: string, pdf: Blob) {
  checkPath(path);
  if (pdf.type !== "application/pdf" || pdf.size === 0 || pdf.size > MAX_BYTES)
    throw new Error("Finished cover letter must be a valid PDF of 25 MB or less.");
  const { error } = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (error) throw new Error("Unable to save the PDF: " + error.message);
}
export async function downloadSavedCover(path: string): Promise<Blob> {
  checkPath(path);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Unable to download saved cover letter: " + (error?.message ?? ""));
  if (data.size > MAX_BYTES) throw new Error("Saved PDF exceeds the allowed limit.");
  return data;
}
export async function rollbackSavedCover(path: string) {
  checkPath(path);
  await supabase.storage.from(BUCKET).remove([path]);
}
export function triggerPdfDownload(blob: Blob, filename: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename.replace(/[^a-z0-9 _().-]/gi, "_").slice(0,120) + ".pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
