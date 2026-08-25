import { supabase } from "@/lib/supabase";

type Certificate = {
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
};

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certificateId: string }>;
}) {
  const { certificateId } = await params;

  const { data: certificate, error } = await supabase
    .from("certificates")
    .select(
      `
      certificate_id,
      client,
      valuation_date,
      purpose,
      owner_name,
      property_type,
      property_area,
      location,
      price_per_sq_meter,
      total_property_value,
      status
    `
    )
    .eq("certificate_id", certificateId)
    .single();

  if (error || !certificate) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">
              ✕
            </div>

            <h1 className="mt-6 text-3xl font-bold text-slate-900">
              Certificate Not Found
            </h1>

            <p className="mt-3 text-slate-600">
              We could not find a certificate with this Certificate ID.
            </p>

            <p className="mt-6 text-sm text-slate-500">
              Certificate ID: {certificateId}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const isActive = certificate.status === "Active";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">

        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">
            CertVerify
          </h1>

          <p className="mt-2 text-slate-600">
            Certificate Verification
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

          <div
            className={`px-8 py-8 text-center ${
              isActive ? "bg-green-50" : "bg-red-50"
            }`}
          >
            <div
              className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl ${
                isActive
                  ? "bg-green-100 text-green-600"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {isActive ? "✓" : "!"}
            </div>

            <h2
              className={`mt-5 text-3xl font-bold ${
                isActive ? "text-green-700" : "text-red-700"
              }`}
            >
              {isActive
                ? "Certificate Verified"
                : "Certificate Not Active"}
            </h2>

            <p className="mt-2 text-slate-600">
              {isActive
                ? "This certificate exists in the CertVerify system."
                : `This certificate is currently ${certificate.status.toLowerCase()}.`}
            </p>
          </div>

          <div className="p-8">

            <div className="mb-8 border-b pb-6 text-center">
              <p className="text-sm text-slate-500">
                Certificate ID
              </p>

              <p className="mt-2 text-2xl font-bold text-slate-900">
                {certificate.certificate_id}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">

              <div>
                <p className="text-sm text-slate-500">
                  Client
                </p>
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
                  Owner
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

              <div className="md:col-span-2">
                <p className="text-sm text-slate-500">
                  Total Property Value
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {certificate.total_property_value
                    ? `₹ ${Number(
                        certificate.total_property_value
                      ).toLocaleString("en-IN")}`
                    : "—"}
                </p>
              </div>

            </div>

            <div className="mt-10 border-t pt-6 text-center">
              <p className="text-xs text-slate-500">
                Verification provided by CertVerify
              </p>

              <p className="mt-1 text-xs text-slate-400">
                Always verify the Certificate ID before relying on this
                certificate.
              </p>
            </div>

          </div>
        </div>

      </div>
    </main>
  );
}