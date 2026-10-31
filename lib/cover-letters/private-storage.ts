import { requireSelectedAccountId } from "@/lib/accounts/context";
import { supabase } from "@/lib/supabase";

const BUCKET = "certverify-letterheads";
import { DOCX_MIME, PDF_MIME, MAX_FILE_BYTES } from "@/lib/cover-letters/native-documents";
const MAX_BYTES = MAX_FILE_BYTES;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Private storage adapter. Replace this module to switch from Supabase Storage
 * without changing the letterhead designer or PDF renderer.
 */
export function letterheadStoragePath(templateId: string, mime: string) {
  if (!uuid.test(templateId)) throw new Error("Invalid letterhead ID.");
  const extension = mime === "image/png" ? ".png" : mime === "image/jpeg" ? ".jpg" :
    mime === PDF_MIME ? ".pdf" : mime === DOCX_MIME ? ".docx" : "";
  if (!extension) throw new Error("Choose a PDF, DOCX, JPG or PNG letterhead.");
  return [requireSelectedAccountId(), templateId, crypto.randomUUID() + extension].join("/");
}

function assertWorkspacePath(path: string) {
  if (!path.startsWith(requireSelectedAccountId() + "/")) {
    throw new Error("Letterhead belongs to another organization.");
  }
}

export async function uploadLetterhead(path: string, file: File) {
  assertWorkspacePath(path);
  if (!file.size || file.size > MAX_BYTES) throw new Error("Letterhead must be 12 MB or smaller.");
  if (!["image/jpeg", "image/png", PDF_MIME, DOCX_MIME].includes(file.type)) throw new Error("Choose a PDF, DOCX, JPG or PNG letterhead.");
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Could not upload private letterhead: " + error.message);
}
export async function downloadLetterhead(path: string): Promise<Blob> {
  assertWorkspacePath(path);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Cannot read private letterhead: " + (error?.message ?? ""));
  if (data.size > MAX_BYTES) throw new Error("Saved letterhead exceeds the 12 MB limit.");
  return data;
}
export async function removeUncommittedLetterhead(path: string) {
  assertWorkspacePath(path);
  await supabase.storage.from(BUCKET).remove([path]);
}
