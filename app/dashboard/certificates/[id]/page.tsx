"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";

type Certificate = {
  id: string;
  certificate_id: string;
  client: string;
  valuation_date: string;
  purpose: string | null;
  owner_name: string | null;
  property_type: string | null;
  property_area: number | null;
  location: string;
  price_per_sq_meter: number | null;
  total_property_value: number | null;
  status: string;
  created_at: string;
};

export default function ViewCertificatePage() {
  const params = useParams();
  const id = params.id as string;

  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [qrCode, setQrCode] = useState("");

  useEffect(() => {
    loadCertificate();
  }, [id]);

  async function loadCertificate() {
    setLoading(true);
    setErrorMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setErrorMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("certificates")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (error) {
      setErrorMessage(error.message);
    } else {
      setCertificate(data);
    }

    setLoading(false);
  }

  async function generateQRCode() {
    if (!certificate) return;

    const verificationUrl = `${window.location.origin}/verify/${encodeURIComponent(
      certificate.certificate_id
    )}`;

    const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
      width: 300,
      margin: 2,
    });

    setQrCode(qrDataUrl);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl rounded-2xl bg-white p-8 shadow-sm">
          Loading certificate...
        </div>
      </main>
    );
  }

  if (errorMessage || !certificate) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl bg-white p-8 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">
              Certificate not found
            </h1>

            <p className="mt-2 text-slate-600">
              {errorMessage || "This certificate could not be found."}
            </p>

            <Link
              href="/dashboard/certificates/list"
              className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-3 font-medium text-white"
            >
              Back to My Certificates
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Certificate Details
            </h1>

            <p className="mt-2 text-slate-600">
              Certificate ID: {certificate.certificate_id}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={generateQRCode}
              className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
            >
              Generate QR
            </button>

            <Link
              href="/dashboard/certificates/list"
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </Link>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-sm">

          <div className="mb-8 border-b pb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Certificate ID
                </p>

                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {certificate.certificate_id}
                </p>
              </div>

              <span className="rounded-full bg-green-100 px-4 py-2 text-sm font-medium text-green-700">
                {certificate.status}
              </span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">

            <div>
              <p className="text-sm text-slate-500">Client</p>
              <p className="mt-1 font-medium text-slate-900">
                {certificate.client}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Date of Valuation
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {certificate.valuation_date}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Purpose
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {certificate.purpose || "—"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Owner Name
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {certificate.owner_name || "—"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Property Type
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {certificate.property_type || "—"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Property Area
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {certificate.property_area
                  ? `${certificate.property_area} sq. m.`
                  : "—"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Location
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {certificate.location}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Price per Sq. Meter
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {certificate.price_per_sq_meter
                  ? `₹ ${Number(
                      certificate.price_per_sq_meter
                    ).toLocaleString("en-IN")}`
                  : "—"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                Total Property Value
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {certificate.total_property_value
                  ? `₹ ${Number(
                      certificate.total_property_value
                    ).toLocaleString("en-IN")}`
                  : "—"}
              </p>
            </div>

          </div>

          {qrCode && (
            <div className="mt-10 border-t pt-8 text-center">
              <h2 className="text-xl font-semibold text-slate-900">
                Verification QR Code
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Scan this QR code to verify the certificate.
              </p>

              <div className="mt-6 flex justify-center">
                <img
                  src={qrCode}
                  alt="Certificate verification QR code"
                  className="h-64 w-64 rounded-lg border bg-white p-3"
                />
              </div>

              <p className="mt-4 break-all text-xs text-slate-500">
                {window.location.origin}/verify/
                {certificate.certificate_id}
              </p>
            </div>
          )}

          <div className="mt-10 border-t pt-6">
            <p className="text-xs text-slate-500">
              Created on
            </p>

            <p className="mt-1 text-sm text-slate-700">
              {new Date(
                certificate.created_at
              ).toLocaleString("en-IN")}
            </p>

            <p className="mt-4 text-xs text-slate-500">
              Verification provided by CertVerify
            </p>
          </div>

        </div>

      </div>
    </main>
  );
}