"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";
import { publicVerificationUrl } from "@/lib/certificates/public-verification-url";
import { IssuerBranding } from "@/components/issuer-branding";
import { CertificateStatusActions } from "@/components/certificate-status-actions";
import { ValuationJobPayment } from "@/components/valuation-job-payment";
import { DownloadCoverLetter } from "@/components/download-cover-letter";
import {geoUrl,parseGeoLocation} from "@/lib/geo/location";

type Certificate = {
  id: string;
  certificate_id: string;
  status: string;
  created_at: string;
  template_id: string | null;
  template_name: string | null;
  report_format_id: string | null;
  cover_letter_format_id: string | null;
  public_verification_id: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
  public_revocation_reason: string | null;
  revocation_previous_status: string | null;
};

type CertificateFieldValue = {
  id: string;
  certificate_id: string;
  field_name: string;
  field_type: string;
  field_value: string | null;
  is_public: boolean;
  display_order: number;
};

export default function ViewCertificatePage() {
  const params = useParams();
  const id = params.id as string;

  const [certificate, setCertificate] =
    useState<Certificate | null>(null);

  const [fieldValues, setFieldValues] =
    useState<CertificateFieldValue[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingFields, setLoadingFields] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [justCreated, setJustCreated] = useState(false);

  useEffect(() => {
    if (!certificate?.public_verification_id) return;
    let active = true;
    // Show the QR automatically on the saved certificate details screen.
    const verificationUrl = publicVerificationUrl(certificate.public_verification_id, window.location.origin);
    void QRCode.toDataURL(verificationUrl, { width: 300, margin: 2 }).then((dataUrl) => {
      if (active) setQrCode(dataUrl);
    }).catch(() => {
      if (active) setErrorMessage("Could not generate the QR code. Try Generate QR.");
    });
    return () => { active = false; };
  }, [certificate?.public_verification_id]);

  useEffect(() => {
    void Promise.resolve().then(() => setJustCreated(new URLSearchParams(window.location.search).get("created") === "1"));
  }, []);

  async function loadCertificate() {
    setLoading(true);
    setLoadingFields(true);
    setErrorMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErrorMessage("You must be logged in.");
      setLoading(false);
      setLoadingFields(false);
      return;
    }

    const { data, error } = await supabase
      .from("certificates")
      .select(
        "id, certificate_id, status, created_at, template_id, template_name, report_format_id, cover_letter_format_id, public_verification_id, revoked_at, revoked_by, revocation_reason, public_revocation_reason, revocation_previous_status"
      )
      .eq("id", id)
      .single();

    if (error) {
      setErrorMessage(
        "Could not load certificate: " + error.message
      );
      setLoading(false);
      setLoadingFields(false);
      return;
    }

    setCertificate(data);
    setLoading(false);

    // This function declaration is hoisted; the call intentionally follows the certificate fetch.
    // eslint-disable-next-line react-hooks/immutability
    await loadFieldValues(data.id);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (id) void loadCertificate();
    });
  }, [id]);

  async function loadFieldValues(certificateId: string) {
    setLoadingFields(true);

    const { data, error } = await supabase
      .from("certificate_field_values")
      .select(
        "id, certificate_id, field_name, field_type, field_value, is_public, display_order"
      )
      .eq("certificate_id", certificateId)
      .order("display_order", { ascending: true });

    if (error) {
      setErrorMessage(
        "Could not load certificate details: " +
          error.message
      );

      setFieldValues([]);
      setLoadingFields(false);
      return;
    }

    setFieldValues(data || []);
    setLoadingFields(false);
  }

  async function generateQRCode() {
    if (!certificate) {
      return;
    }

    try {
      const verificationUrl =
        publicVerificationUrl(certificate.public_verification_id, window.location.origin);

      const qrDataUrl = await QRCode.toDataURL(
        verificationUrl,
        {
          width: 300,
          margin: 2,
        }
      );

      setQrCode(qrDataUrl);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not generate QR code."
      );
    }
  }

  async function downloadQRCode(format: "png" | "jpeg") {
    if (!qrCode || !certificate) {
      return;
    }

    const link = document.createElement("a");

    link.href = await QRCode.toDataURL(publicVerificationUrl(certificate.public_verification_id, window.location.origin), {
      width: 600, margin: 2, type: format === "jpeg" ? "image/jpeg" : "image/png",
      color: { dark: "#000000", light: "#ffffff" },
    });

    link.download =
      `ValuerSeal-${certificate.certificate_id}.${format === "jpeg" ? "jpg" : "png"}`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function formatFieldValue(
    value: string | null,
    fieldType: string
  ) {
    if (value === null || value.trim() === "") {
      return "—";
    }

    if (fieldType === "date") {
      const parsedDate = new Date(value);

      if (!Number.isNaN(parsedDate.getTime())) {
        return parsedDate.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    }

    if (fieldType === "number") {
      const numberValue = Number(value);

      if (!Number.isNaN(numberValue)) {
        return numberValue.toLocaleString("en-IN");
      }
    }

    return value;
  }

  function getStatusClasses(status: string) {
    switch (status.toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-700";

      case "revoked":
        return "bg-red-100 text-red-700";

      case "inactive":
        return "bg-slate-100 text-slate-700";

      default:
        return "bg-slate-100 text-slate-700";
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm">
          Loading certificate...
        </div>
      </main>
    );
  }

  if (!certificate) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-xl bg-white p-8 text-center">
          <h1 className="text-xl font-semibold text-slate-900">
            Certificate not found
          </h1>

          {errorMessage && (
            <p className="mt-3 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <Link
            href="/dashboard/certificates/list"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white"
          >
            Back to Certificates
          </Link>
        </div>
      </main>
    );
  }

  const verificationUrl =
    typeof window !== "undefined"
      ? publicVerificationUrl(certificate.public_verification_id, window.location.origin)
      : "";


  return (
    <main className="cv-page">
      <div className="cv-shell max-w-6xl space-y-6">
        <Link href="/dashboard/certificates/list"
          className="inline-flex min-h-11 items-center text-base font-bold text-teal-800 hover:underline">
          ← Back to My Certificates
        </Link>

        <header className="rounded-2xl border border-slate-200 bg-white px-5 py-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-teal-800">YOUR VALUATION RECORD</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
                Certificate Details
              </h1>
              <p className="mt-2 text-lg font-semibold text-slate-700">
                {certificate.template_name || "Property Valuation"}
              </p>
              <p className="mt-2 break-all text-sm text-slate-500">
                Certificate: {certificate.certificate_id}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={"rounded-full px-4 py-2 text-sm font-semibold " + getStatusClasses(certificate.status)}>
                {certificate.status}
              </span>
              <Link href={verificationUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-teal-800 hover:bg-slate-50">
                View public verification ↗
              </Link>
            </div>
          </div>
        </header>

        {justCreated && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-base font-semibold text-emerald-900">
          ✓ Certificate saved. Your letterhead with QR is ready to download below.
        </p>}
        {errorMessage && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-base text-red-800">
          {errorMessage}
        </p>}

        {certificate.status==="Revoked" && <section className="rounded-xl border border-red-300 bg-red-50 px-5 py-4">
          <h2 className="text-lg font-bold text-red-900">This certificate is revoked</h2>
          <p className="mt-1 text-sm text-red-800">
            QR verification will show its revoked status. Do not present it as currently valid.
          </p>
          <Link href={"/dashboard/certificates?replaces="+certificate.id}
            className="mt-2 inline-block min-h-10 pt-2 font-bold text-red-900 underline">
            Issue a replacement certificate
          </Link>
        </section>}

        {loadingFields ? <p role="status" className="rounded-xl bg-white p-6 text-base">
          Loading your document downloads…
        </p> : <DownloadCoverLetter
          certificateNumber={certificate.certificate_id}
          certificateCreatedAt={certificate.created_at}
          verificationId={certificate.public_verification_id}
          templateId={certificate.template_id}
          preferredReportId={certificate.report_format_id}
          preferredCoverId={certificate.cover_letter_format_id}
          fieldValues={fieldValues}
        />}

        <section aria-label="More certificate tasks" className="rounded-2xl border border-slate-200 bg-white px-5 py-5 sm:px-7">
          <h2 className="text-lg font-extrabold text-slate-900">More options</h2>
          <p className="mt-1 text-sm text-slate-600">Only open these when you need them.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <a href="#job-payment" onClick={()=>document.getElementById("job-payment")?.setAttribute("open","")}
              className="inline-flex min-h-12 items-center rounded-xl border border-slate-200 px-4 text-base font-semibold text-slate-700 hover:bg-slate-50">
              Job payment details
            </a>
            <a href="#record-details" onClick={()=>document.getElementById("record-details")?.setAttribute("open","")}
              className="inline-flex min-h-12 items-center rounded-xl border border-slate-200 px-4 text-base font-semibold text-slate-700 hover:bg-slate-50">
              View all property fields
            </a>
            <a href="#qr-image" onClick={()=>document.getElementById("qr-image")?.setAttribute("open","")}
              className="inline-flex min-h-12 items-center rounded-xl border border-slate-200 px-4 text-base font-semibold text-slate-700 hover:bg-slate-50">
              Download the QR image only
            </a>
            <a href="#certificate-status" onClick={()=>document.getElementById("certificate-status")?.setAttribute("open","")}
              className="inline-flex min-h-12 items-center rounded-xl border border-slate-200 px-4 text-base font-semibold text-slate-700 hover:bg-slate-50">
              Certificate status and history
            </a>
          </div>
        </section>

        <details id="job-payment" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white"
          open={typeof window!=="undefined" && window.location.hash==="#job-payment" ? true : undefined}>
          <summary className="cursor-pointer px-5 py-5 text-lg font-bold text-slate-900 sm:px-7">
            Job payment details <span className="ml-2 text-sm font-normal text-slate-500">Private to your office</span>
          </summary>
          <div className="border-t border-slate-100 p-3 sm:p-4">
            <ValuationJobPayment certificateId={certificate.id}/>
          </div>
        </details>

        <details id="record-details" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-5 py-5 text-lg font-bold text-slate-900 sm:px-7">
            All property and valuation details ({fieldValues.length})
          </summary>
          <section className="border-t border-slate-100 p-5 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              {fieldValues.length===0 ? <p className="text-slate-500">No additional fields available.</p>
                : fieldValues.map(field=><div key={field.id} className="rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-500">{field.field_name}</p>
                  <p className="mt-2 break-words text-base font-medium text-slate-900">
                    {field.field_type==="location" ? (()=>{
                      const point=parseGeoLocation(field.field_value);
                      return point?<a href={geoUrl(point)} target="_blank" rel="noopener noreferrer"
                        className="font-bold text-teal-800 underline">View property location on map ↗</a>:"No saved location";
                    })() : formatFieldValue(field.field_value,field.field_type)}
                  </p>
                </div>)}
            </div>
          </section>
        </details>

        <details id="qr-image" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-5 py-5 text-lg font-bold text-slate-900 sm:px-7">
            QR image only <span className="ml-2 text-sm font-normal text-slate-500">For manual use</span>
          </summary>
          <section className="border-t border-slate-100 p-5 sm:p-7">
            <p className="text-base text-slate-600">
              Most users should download Letterhead + QR above. Use these separate QR images only when needed.
            </p>
            {qrCode && <img src={qrCode} alt={"QR code for "+certificate.certificate_id}
              className="mt-4 h-52 w-52 rounded-xl border border-slate-200 bg-white p-3" width={208} height={208}/>}
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" disabled={!qrCode} onClick={()=>{void downloadQRCode("jpeg");}}
                className="cv-primary min-h-12 disabled:opacity-50">Download JPEG</button>
              <button type="button" disabled={!qrCode} onClick={()=>{void downloadQRCode("png");}}
                className="cv-secondary min-h-12 disabled:opacity-50">Download PNG</button>
              <button type="button" onClick={()=>{void generateQRCode();}}
                className="cv-secondary min-h-12">Generate QR</button>
            </div>
            {verificationUrl && <p className="mt-3 break-all text-sm text-slate-500">{verificationUrl}</p>}
          </section>
        </details>

        <details id="certificate-status" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-5 py-5 text-lg font-bold text-slate-900 sm:px-7">
            Certificate status and history
          </summary>
          <div className="space-y-4 border-t border-slate-100 p-4">
            <CertificateStatusActions certificateId={certificate.id} status={certificate.status} onChanged={loadCertificate}/>
            {certificate.status==="Revoked" && <section className="rounded-xl border border-red-200 bg-red-50 p-5">
              <h2 className="text-lg font-bold text-red-900">Revocation record</h2>
              <p className="mt-2 text-sm">Internal reason: {certificate.revocation_reason||"Not recorded"}</p>
              <p className="mt-2 text-sm">Public explanation: {certificate.public_revocation_reason||"None"}</p>
              <p className="mt-2 text-sm">Revoked on: {certificate.revoked_at?new Date(certificate.revoked_at).toLocaleString("en-IN"):"Not recorded"}</p>
              <p className="mt-2 text-sm">Previous status: {certificate.revocation_previous_status||"Not recorded"}</p>
              <p className="mt-2 text-sm">Responsible user: {certificate.revoked_by||"Not recorded"}</p>
            </section>}
            <details className="rounded-lg bg-slate-50 p-4">
              <summary className="cursor-pointer font-semibold">Issuer information</summary>
              <IssuerBranding certificateId={certificate.id}/>
            </details>
          </div>
        </details>
      </div>
    </main>
  );
}
