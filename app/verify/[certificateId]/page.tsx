import { publicVerificationRepository, type PublicCertificate } from "@/lib/providers/public-verification";
import Link from "next/link";
import { BrandingLogo } from "@/components/branding-logo";
import { statusPresentation } from "@/lib/certificates/status";
import { suggestedDisplayFields } from "@/lib/valuation/register";
import {geoUrl,parseGeoLocation} from "@/lib/geo/location";

export default async function VerifyCertificatePage({ params }: { params: Promise<{ certificateId: string }> }) {
  const { certificateId } = await params;
  // Next.js already decodes route parameters; do not decode historical labels twice.
  // This server-only repository hides which database currently serves verification.
  let certificate: PublicCertificate | null = null;
  let unavailable = false;
  try {
    certificate = await publicVerificationRepository().findByReference(certificateId);
  } catch {
    unavailable = true;
  }
  if (unavailable || !certificate) return <main className="mx-auto max-w-xl px-6 py-12">
    <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold">{unavailable ? "Verification Temporarily Unavailable" : "Certificate Not Found"}</h1>
      <p className="mt-4 text-slate-600">{unavailable ? "We could not check the current status. Please try again; this is not a validity result." : "This link could not identify a certificate. Ask the issuer for the certificate's current QR code."}</p>
    </section>
    <footer className="mt-6 text-center text-sm"><Link href="/">Powered by ValuerSeal</Link></footer>
  </main>;
  const presentation = statusPresentation(certificate.status);
  // Surface only the issuer-authorized public fields, with their exact
  // snapshotted names. Never infer a property owner from a generic client.
  const publicHighlights=suggestedDisplayFields(certificate.fields.map(field=>field.field_name))
    .slice(0,4).flatMap(name=>{
      const matches=certificate.fields.filter(field=>field.field_name===name && field.field_value?.trim());
      return matches.length===1 ? matches : [];
    });
  return <main className="mx-auto max-w-2xl px-6 py-12">
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <header className="border-b p-8 text-center">
        {certificate.logo_available && <BrandingLogo src={`/api/public/certificates/${certificate.public_verification_id}/logo`} alt={`${certificate.issuer_name || "Issuer"} logo`} size={128} className="mx-auto mb-4 h-32 w-32 object-contain" fallback="Issuer logo temporarily unavailable" />}
        {certificate.logo_available === false && <p className="mb-3 text-xs text-slate-500">No approved logo was attached when this certificate was issued.</p>}
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl ${presentation.classes}`}>{presentation.icon}</div>
        <h1 className="mt-5 text-2xl font-bold">{presentation.title}</h1>
        <p className="mt-3 text-slate-600">{presentation.description}</p>
      </header>
      <div className="space-y-6 p-8">
        {publicHighlights.length>0 && <section aria-label="Valuation reference details" className="rounded-xl border border-teal-100 bg-teal-50 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-900">Valuation reference</h2>
          <dl className="mt-3 grid gap-4 sm:grid-cols-2">
            {publicHighlights.map(field=><div key={field.id}>
              <dt className="text-xs font-semibold text-slate-600">{field.field_name}</dt>
              <dd className="mt-1 break-words text-sm font-bold text-slate-900">
                {field.field_type==="location" ? (()=>{
                  const point=parseGeoLocation(field.field_value);
                  return point ? <a href={geoUrl(point)} target="_blank" rel="noopener noreferrer" className="underline">View shared property location</a> : "—";
                })() : field.field_value}
              </dd>
            </div>)}
          </dl>
        </section>}
        <dl className="space-y-4 rounded-xl bg-slate-50 p-5">
          <div><dt className="text-sm text-slate-500">Issued by</dt><dd className="mt-1 font-semibold">{certificate.issuer_name || "Issuer information unavailable"}</dd></div>
          {certificate.issuer_details && <div><dt className="text-sm text-slate-500">Professional details</dt><dd className="mt-1 whitespace-pre-wrap">{certificate.issuer_details}</dd></div>}
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
            {certificate.fields.map((field) => <div key={field.id} className="rounded border p-4"><dt className="text-sm text-slate-500">{field.field_name}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{field.field_type === "location" ? (()=>{const point=parseGeoLocation(field.field_value);return point ? <a href={geoUrl(point)} rel="noopener noreferrer" target="_blank" className="text-blue-700 underline">View shared location: {point.lat.toFixed(6)}, {point.lng.toFixed(6)}</a> : "—";})() : field.field_value || "—"}</dd></div>)}
          </dl>}
        </section>
      </div>
      <footer className="border-t p-5 text-center text-xs text-slate-500"><Link href="/" className="font-medium text-blue-700">Powered by ValuerSeal</Link></footer>
    </article>
  </main>;
}
