import { createClient } from "@supabase/supabase-js";

function createSupabaseServerClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function formatFieldValue(
  value: string,
  fieldType: string
) {
  if (!value || value.trim() === "") {
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

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ certificateId: string }>;
}) {
  const { certificateId } = await params;

  const supabase = await createSupabaseServerClient();

  const decodedCertificateId =
    decodeURIComponent(certificateId);

  const {
    data: certificate,
    error: certificateError,
  } = await supabase
    .from("certificates")
    .select("id, certificate_id, status")
    .eq("certificate_id", decodedCertificateId)
    .maybeSingle();

  if (certificateError) {
    console.error(
      "Certificate verification error:",
      certificateError.message
    );
  }

  if (!certificate) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-2xl">
            ✕
          </div>

          <h1 className="mt-5 text-2xl font-bold text-slate-900">
            Certificate Not Found
          </h1>

          <p className="mt-3 text-sm text-slate-500">
            The certificate number could not be verified.
          </p>

          <p className="mt-6 text-xs text-slate-400">
            Certificate ID: {decodedCertificateId}
          </p>
        </div>
      </main>
    );
  }

  /*
   * Record this successful certificate lookup.
   *
   * The database function controls the insert, so the public
   * page cannot directly insert arbitrary verification records.
   */
  const { error: verificationError } =
    await supabase.rpc(
      "record_certificate_verification",
      {
        requested_certificate_id: certificate.id,
      }
    );

  if (verificationError) {
    console.error(
      "Could not record certificate verification:",
      verificationError.message
    );
  }

  const {
    data: fieldValues,
    error: fieldValuesError,
  } = await supabase
    .from("certificate_field_values")
    .select(
      "id, field_name, field_type, field_value, is_public, display_order"
    )
    .eq("certificate_id", certificate.id)
    .eq("is_public", true)
    .order("display_order", {
      ascending: true,
    });

  if (fieldValuesError) {
    console.error(
      "Certificate field error:",
      fieldValuesError.message
    );
  }

  const publicFields =
    fieldValuesError || !fieldValues
      ? []
      : fieldValues;

  const isRevoked =
    certificate.status.toLowerCase() === "revoked";

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">

          <div className="border-b border-slate-200 p-8 text-center">
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
                isRevoked
                  ? "bg-red-100"
                  : "bg-green-100"
              }`}
            >
              {isRevoked ? "!" : "✓"}
            </div>

            <h1 className="mt-5 text-2xl font-bold text-slate-900">
              {isRevoked
                ? "Certificate Revoked"
                : "Certificate Verified"}
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {isRevoked
                ? "This certificate exists in the CertVerify system but has been revoked."
                : "This certificate has been successfully verified through CertVerify."}
            </p>
          </div>

          <div className="p-8">

            <div className="rounded-xl bg-slate-50 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Certificate Number
              </p>

              <p className="mt-2 break-all text-lg font-bold text-slate-900">
                {certificate.certificate_id}
              </p>
            </div>

            <div className="mt-6">
              <h2 className="text-lg font-semibold text-slate-900">
                Certificate Details
              </h2>

              {publicFields.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No public certificate details are available.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {publicFields.map((field) => (
                    <div
                      key={field.id}
                      className="rounded-lg border border-slate-200 p-4"
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {field.field_name}
                      </p>

                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {formatFieldValue(
                          field.field_value,
                          field.field_type
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          <div className="border-t border-slate-200 px-8 py-5 text-center">
            <p className="text-xs text-slate-400">
              Verification provided by CertVerify
            </p>
          </div>

        </div>
      </div>
    </main>
  );
}