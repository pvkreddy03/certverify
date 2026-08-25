"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

export default function CertificateListPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadCertificates();
  }, []);

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

    const { data, error } = await supabase
      .from("certificates")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setCertificates(data || []);
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">

        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              My Certificates
            </h1>

            <p className="mt-2 text-slate-600">
              View and manage your certificates.
            </p>
          </div>

          <Link
            href="/dashboard/certificates"
            className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
          >
            + Create Certificate
          </Link>
        </div>

        {loading && (
          <div className="rounded-xl bg-white p-8 text-slate-600 shadow-sm">
            Loading certificates...
          </div>
        )}

        {errorMessage && (
          <div className="rounded-xl bg-red-50 p-5 text-red-700">
            {errorMessage}
          </div>
        )}

        {!loading && !errorMessage && certificates.length === 0 && (
          <div className="rounded-xl bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">
              No certificates yet
            </h2>

            <p className="mt-2 text-slate-600">
              Create your first certificate to get started.
            </p>

            <Link
              href="/dashboard/certificates"
              className="mt-6 inline-block rounded-lg bg-slate-900 px-5 py-3 font-medium text-white"
            >
              Create Certificate
            </Link>
          </div>
        )}

        {!loading && certificates.length > 0 && (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b bg-slate-50">
                  <tr>
                    <th className="px-5 py-4 text-sm font-semibold">
                      Certificate ID
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold">
                      Client
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold">
                      Valuation Date
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold">
                      Location
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold">
                      Status
                    </th>

                    <th className="px-5 py-4 text-sm font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {certificates.map((certificate) => (
                    <tr
                      key={certificate.id}
                      className="border-b last:border-b-0"
                    >
                      <td className="px-5 py-4 font-medium text-slate-900">
                        {certificate.certificate_id}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {certificate.client}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {certificate.valuation_date}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {certificate.location}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                          {certificate.status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={`/dashboard/certificates/${certificate.id}`}
                          className="text-sm font-medium text-slate-900 underline"
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