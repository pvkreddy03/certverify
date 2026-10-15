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

    const { data: profileData, error: profileError } =
      await supabase
        .from("profiles")
        .select("user_id, professional_name")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError) {
      setErrorMessage(
        "Could not load profile: " + profileError.message
      );
      setLoading(false);
      return;
    }

    const createdBy =
      profileData?.professional_name?.trim() || "You";

    const rows: CertificateRow[] = certificatesData.map(
      (certificate) => ({
        ...certificate,
        templateName:
          certificate.template_name?.trim() ||
          "Template name unavailable",
        createdBy: certificate.user_id === user.id ? createdBy : "Organization member",
      })
    );

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
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">

        <Link href="/dashboard/certificates/bulk" className="mb-4 inline-flex rounded border border-blue-200 bg-blue-50 px-4 py-2 font-semibold text-blue-700">View bulk imports / Upload Excel</Link>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href="/dashboard"
              className="mb-3 inline-block text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              ← Back to Dashboard
            </Link>

            <h1 className="text-3xl font-bold text-slate-900">
              My Certificates
            </h1>

            <p className="mt-2 text-slate-600">
              View certificates you have created.
            </p>
          </div>

          <Link
            href="/dashboard/certificates"
            className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
          >
            + Create Certificate
          </Link>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            Loading certificates...
          </div>
        ) : certificates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
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
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
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
                      className="hover:bg-slate-50"
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