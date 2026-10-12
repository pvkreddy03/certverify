import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { statusPresentation } from "@/lib/certificates/status";

type PublicCertificate = {
  certificate_id: string;
  public_verification_id: string;
  issuer_name: string | null;
  issued_at: string;
  status: string;
  revoked_at: string | null;
  public_revocation_reason: string | null;
  fields: { id: string; field_name: string; field_type: string; field_value: string | null }[];
};

export default async function VerifyCertificatePage({ params }: { params: Promise<{ certificateId: string }> }) {
  const { certificateId } = await params;
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  // Next.js already decodes route parameters; do not decode historical labels twice.
  const { data, error } = await client.rpc("cv_public_certificate", { p_reference: certificateId });
  const certificate = data as PublicCertificate | null;
  if (error || !certificate) return <main className="mx-auto max-w-xl px-6 py-12">
    <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold">{error ? "Verification Temporarily Unavailable" : "Certificate Not Found"}</h1>
      <p className="mt-4 text-slate-600">{error ? "We could not check the current status. Please try again; this is not a validity result." : "This link could not identify a certificate. Ask the issuer for the certificate's current QR code."}</p>
    </section>
  </main>;
  const presentation = statusPresentation(certificate.status);
  return <main className="mx-auto max-w-2xl px-6 py-12">
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <header className="border-b p-8 text-center">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl ${presentation.classes}`}>{presentation.icon}</div>
        <h1 className="mt-5 text-2xl font-bold">{presentation.title}</h1>
        <p className="mt-3 text-slate-600">{presentation.description}</p>
      </header>
      <div className="space-y-6 p-8">
        <dl className="space-y-4 rounded-xl bg-slate-50 p-5">
          <div><dt className="text-sm text-slate-500">Issued by</dt><dd className="mt-1 font-semibold">{certificate.issuer_name || "Issuer information unavailable"}</dd></div>
          <div><dt className="text-sm text-slate-500">Certificate Number</dt><dd className="mt-1 break-all font-semibold">{certificate.certificate_id}</dd></div>
          <div><dt className="text-sm text-slate-500">Issued on</dt><dd className="mt-1">{new Date(certificate.issued_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</dd></div>
          <div><dt className="text-sm text-slate-500">Current status</dt><dd className="mt-1 font-semibold">{certificate.status}</dd></div>
        </dl>
        {certificate.status === "Revoked" && <section className="rounded border border-red-200 bg-red-50 p-5">
          <h2 className="font-semibold">Revocation information</h2>
          <p className="mt-2">{certificate.public_revocation_reason || "The issuer has withdrawn this certificate."}</p>
          {certificate.revoked_at && <p className="mt-2 text-sm">Revoked on {new Date(certificate.revoked_at).toLocaleDateString("en-IN")}</p>}
        </section>}
        <section><h2 className="text-lg font-semibold">Public certificate details</h2>
          {!certificate.fields.length ? <p className="mt-3 text-slate-600">No public certificate details are available.</p> : <dl className="mt-4 space-y-3">
            {certificate.fields.map((field) => <div key={field.id} className="rounded border p-4"><dt className="text-sm text-slate-500">{field.field_name}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{field.field_value || "—"}</dd></div>)}
          </dl>}
        </section>
      </div>
      <footer className="border-t p-5 text-center text-xs text-slate-500"><Link href="/" className="font-medium text-blue-700">Verified using CertVerify — Secure Certificate Authentication</Link></footer>
    </article>
  </main>;
}
