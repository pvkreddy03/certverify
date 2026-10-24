"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PlatformAdminGuide } from "@/components/platform-admin-guide";
import { platformFetch } from "@/lib/platform/client";
import { EMPTY_PUBLIC_CONTACT, type PublicContact } from "@/lib/platform/contact-validation";

export default function PlatformContactPage() {
  const [contact, setContact] = useState<PublicContact>(EMPTY_PUBLIC_CONTACT);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    platformFetch<PublicContact>("/api/platform/contact")
      .then((data) => { if (mounted) setContact({ ...EMPTY_PUBLIC_CONTACT, ...data }); })
      .catch((reason) => { if (mounted) setError(reason instanceof Error ? reason.message : "Could not load contact settings."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      await platformFetch("/api/platform/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contact),
      });
      setMessage("Public contact details updated. The customer login page now displays the current saved values.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save contact details.");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <h1 className="text-3xl font-bold">Public contact details</h1>
      <PlatformAdminGuide section="contact" />
      <p className="text-sm text-slate-600">Only verified platform administrators can change these fields. Blank fields will be hidden on the public login page. This is separate from customer organization contact settings.</p>
      {loading && <p>Loading contact details…</p>}
      {error && <p role="alert" className="rounded bg-red-50 p-4 text-red-700">{error}</p>}
      {message && <p role="status" className="rounded bg-green-50 p-4 text-green-700">{message}</p>}
      {!loading && <form onSubmit={save} className="space-y-5 rounded-xl border bg-white p-6">
        {([
          ["support_email", "Support Email ID", "email", 254],
          ["support_phone", "Telephone / WhatsApp number", "tel", 26],
          ["website_url", "Website or help page (HTTPS)", "url", 500],
          ["help_text", "Additional public help message", "text", 500],
        ] as const).map(([key, label, type, maxLength]) => (
          <label key={key} className="block text-sm font-medium">
            {label}
            <input type={type} maxLength={maxLength} value={contact[key]} onChange={(event) => setContact((old) => ({ ...old, [key]: event.target.value }))}
              className="mt-2 block w-full rounded border border-slate-300 px-4 py-3 text-slate-900" />
          </label>
        ))}
        <button disabled={busy} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Saving..." : "Save public contact details"}</button>
      </form>}
    </main>
  );
}
