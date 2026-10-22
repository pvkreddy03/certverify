"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Certificate = {
  id: string;
  certificate_id: string;
  status: string;
  created_at: string;
  template_id: string | null;
  template_name: string | null;
  user_id: string;
};

type CertificateRow = Certificate & {
  templateName: string;
  createdBy: string;
};

export default function CertificateListPage() {
  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadCertificates() {
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

    const { data: certificateData, error: certificateError } =
      await supabase
        .from("certificates")
        .select(
          "id, certificate_id, status, created_at, template_id, template_name, user_id"
        )
        .order("created_at", { ascending: false });

    if (certificateError) {
      setErrorMessage(certificateError.message);
      setLoading(false);
      return;
    }

    const certificatesData = certificateData || [];

    // Resolve each certificate's actual creator, not the currently logged-in user.
    // Limit the lookup to IDs already visible through certificate RLS.
    const creatorIds = [...new Set(certificatesData.map((c) => c.user_id))];
    const { data: profiles, error: profileError } = creatorIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, professional_name, email")
          .in("user_id", creatorIds)
      : { data: [], error: null };

    if (profileError) {
      setErrorMessage("Could not load creator details: " + profileError.message);
      setLoading(false);
      return;
    }

    const creatorLabels = new Map(
      (profiles ?? []).map((profile) => [
        profile.user_id,
        profile.professional_name?.trim() || profile.email?.trim() || profile.user_id,
      ])
    );

    const rows: CertificateRow[] = certificatesData.map((certificate) => ({
      ...certificate,
      templateName:
        certificate.template_name?.trim() || "Template name unavailable",
      createdBy:
        creatorLabels.get(certificate.user_id) ||
        (certificate.user_id === user.id ? user.email : null) ||
        certificate.user_id,
    }));

    setCertificates(rows);
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadCertificates());
  }, []);

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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

  return (
    <main className="cv-page">
      <div className="cv-shell cv-entrance">

        <Link href="/dashboard/certificates/bulk" className="cv-secondary mb-5 text-sm">▦ &nbsp; Bulk imports / Upload Excel →</Link>
        <div className="cv-hero mb-7">
          <div className="cv-hero__body flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="cv-eyebrow mb-3">VERIFICATION LIBRARY</p>
            <h1 className="text-3xl font-bold !text-white">
              My Certificates
            </h1>

            <p className="mt-2 text-[#d2e5ec]">
              Review issued records, access QR codes and monitor certificate status.
            </p>
          </div>

          <Link
            href="/dashboard/certificates"
            className="cv-primary !border-[#3dcbb7] !bg-[#49d7c4] !text-[#09333b]"
          >
            + Create Certificate
          </Link>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="cv-panel p-8 text-center text-slate-500">
            Loading certificates...
          </div>
        ) : certificates.length === 0 ? (
          <div className="cv-panel border-dashed p-12 text-center">
            <h2 className="text-xl font-semibold text-slate-900">
              No certificates yet
            </h2>

            <p className="mt-2 text-slate-500">
              Create your first certificate to get started.
            </p>

            <Link
              href="/dashboard/certificates"
              className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
            >
              Create Certificate
            </Link>
          </div>
        ) : (
          <div className="cv-panel overflow-hidden">
            <div className="overflow-x-auto">
              <table className="cv-table min-w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-700">
                      Certificate Number
                    </th>

                    <th className="px-6 py-4 font-semibold text-slate-700">
                      Template
                    </th>

                    <th className="px-6 py-4 font-semibold text-slate-700">
                      Created By
                    </th>

                    <th className="px-6 py-4 font-semibold text-slate-700">
                      Date Created
                    </th>

                    <th className="px-6 py-4 font-semibold text-slate-700">
                      Status
                    </th>

                    <th className="px-6 py-4 font-semibold text-slate-700">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {certificates.map((certificate) => (
                    <tr
                      key={certificate.id}
                      className="hover:bg-[#f6fbfa]"
                    >
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {certificate.certificate_id}
                      </td>

                      <td className="px-6 py-4 text-slate-700">
                        {certificate.templateName}
                      </td>

                      <td className="px-6 py-4 text-slate-700">
                        {certificate.createdBy}
                      </td>

                      <td className="px-6 py-4 text-slate-700">
                        {formatDate(certificate.created_at)}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusClasses(
                            certificate.status
                          )}`}
                        >
                          {certificate.status}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <Link
                          href={`/dashboard/certificates/${certificate.id}`}
                          className="font-medium text-slate-900 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}