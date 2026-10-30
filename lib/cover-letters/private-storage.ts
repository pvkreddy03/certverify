import { requireSelectedAccountId } from "@/lib/accounts/context";
import { supabase } from "@/lib/supabase";

const BUCKET = "certverify-letterheads";
const MAX_BYTES = 6 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Private storage adapter. Replace this module to switch from Supabase Storage
 * without changing the letterhead designer or PDF renderer.
 */
export function letterheadStoragePath(templateId: string, mime: string) {
  if (!uuid.test(templateId)) throw new Error("Invalid letterhead ID.");
  if (!["image/jpeg", "image/png"].includes(mime)) throw new Error("Only JPG or PNG letterheads are supported.");
  return [requireSelectedAccountId(), templateId, crypto.randomUUID() + (mime === "image/png" ? ".png" : ".jpg")].join("/");
}

function assertWorkspacePath(path: string) {
  if (!path.startsWith(requireSelectedAccountId() + "/")) {
    throw new Error("Letterhead belongs to another organization.");
  }
}

export async function uploadLetterhead(path: string, file: File) {
  assertWorkspacePath(path);
  if (!file.size || file.size > MAX_BYTES) throw new Error("Letterhead must be 6 MB or smaller.");
  if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Choose a JPG or PNG letterhead.");
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Could not upload private letterhead: " + error.message);
}
export async function downloadLetterhead(path: string): Promise<Blob> {
  assertWorkspacePath(path);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Cannot read private letterhead: " + (error?.message ?? ""));
  if (data.size > MAX_BYTES) throw new Error("Saved letterhead exceeds the 6 MB limit.");
  return data;
}
export async function removeUncommittedLetterhead(path: string) {
  assertWorkspacePath(path);
  await supabase.storage.from(BUCKET).remove([path]);
}
