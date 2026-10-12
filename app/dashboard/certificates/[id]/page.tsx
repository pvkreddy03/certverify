"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";

type Certificate = {
  id: string;
  certificate_id: string;
  status: string;
  created_at: string;
  template_id: string | null;
  template_name: string | null;
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
        "id, certificate_id, status, created_at, template_id, template_name"
      )
      .eq("id", id)
      .eq("user_id", user.id)
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
        `${window.location.origin}/verify/` +
        encodeURIComponent(certificate.certificate_id);

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

  function downloadQRCode() {
    if (!qrCode || !certificate) {
      return;
    }

    const link = document.createElement("a");

    link.href = qrCode;

    link.download =
      `CertVerify-${certificate.certificate_id}.png`;

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
      ? `${window.location.origin}/verify/${encodeURIComponent(
          certificate.certificate_id
        )}`
      : "";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">

        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/dashboard/certificates/list"
              className="mb-3 inline-block text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              ← Back to Certificates
            </Link>

            <h1 className="text-3xl font-bold text-slate-900">
              Certificate Details
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {certificate.certificate_id}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generateQRCode}
              className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
            >
              {qrCode ? "Regenerate QR" : "Generate QR"}
            </button>

            <Link
              href="/dashboard/certificates/list"
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </Link>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="space-y-6">

          {/* Certificate Header */}
          <section className="rounded-2xl bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">
                  Certificate Number
                </p>

                <h2 className="mt-1 text-2xl font-bold text-slate-900">
                  {certificate.certificate_id}
                </h2>

                {certificate.template_name && (
                  <p className="mt-2 text-sm text-slate-500">
                    Template:{" "}
                    <span className="font-medium text-slate-700">
                      {certificate.template_name}
                    </span>
                  </p>
                )}
              </div>

              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClasses(
                  certificate.status
                )}`}
              >
                {certificate.status}
              </span>
            </div>
          </section>

          {/* Certificate Details */}
          <section className="rounded-2xl bg-white p-8 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">
              Certificate Details
            </h2>

            {loadingFields ? (
              <p className="mt-6 text-sm text-slate-500">
                Loading certificate details...
              </p>
            ) : fieldValues.length === 0 ? (
              <p className="mt-6 text-sm text-slate-500">
                No certificate fields available.
              </p>
            ) : (
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {fieldValues.map((field) => (
                  <div
                    key={field.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {field.field_name}
                    </p>

                    <p className="mt-2 text-sm font-medium text-slate-900">
                      {formatFieldValue(
                        field.field_value,
                        field.field_type
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* QR Code */}
          {qrCode && (
            <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">
                Certificate Verification QR
              </h2>

              <p className="mt-2 text-sm text-slate-500">
                Scan this QR code to verify the certificate.
              </p>

              <div className="mt-6 flex justify-center">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <img
                    src={qrCode}
                    alt={`QR code for ${certificate.certificate_id}`}
                    width={300}
                    height={300}
                    className="h-[300px] w-[300px]"
                  />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={downloadQRCode}
                  className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
                >
                  Download QR Code
                </button>
              </div>

              {verificationUrl && (
                <p className="mx-auto mt-5 max-w-2xl break-all text-xs text-slate-400">
                  {verificationUrl}
                </p>
              )}
            </section>
          )}

          {/* Footer */}
          <section className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <p className="text-xs text-slate-400">
              Created on{" "}
              {new Date(
                certificate.created_at
              ).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Verification provided by CertVerify
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}