import { isValidEmail } from "@/lib/auth/email-validation";
export type PublicContact = { support_email: string; support_phone: string; website_url: string; help_text: string };
export const EMPTY_PUBLIC_CONTACT: PublicContact = { support_email: "", support_phone: "", website_url: "", help_text: "" };
export function parsePublicContact(raw: unknown): PublicContact {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Enter valid contact details.");
  const record = raw as Record<string, unknown>;
  const allowed = Object.keys(EMPTY_PUBLIC_CONTACT);
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new Error("Unexpected contact field.");
  const fields = Object.fromEntries(allowed.map((key) => [key, String(record[key] ?? "").trim()])) as PublicContact;
  if (fields.support_email && !isValidEmail(fields.support_email)) throw new Error("Enter a valid support Email ID.");
  if (fields.support_phone && !/^\+?[0-9 ()-]{7,26}$/.test(fields.support_phone)) throw new Error("Enter a valid support telephone number.");
  if (fields.website_url) {
    let website: URL;
    try { website = new URL(fields.website_url); } catch { throw new Error("Enter a valid HTTPS website URL."); }
    if (website.protocol !== "https:" || website.username || website.password || website.hostname.length < 4) throw new Error("Enter a valid HTTPS website URL.");
  }
  if (fields.help_text.length > 500 || fields.support_email.length > 254 || fields.support_phone.length > 26 || fields.website_url.length > 500) {
    throw new Error("Contact details exceed the allowed length.");
  }
  return fields;
}
