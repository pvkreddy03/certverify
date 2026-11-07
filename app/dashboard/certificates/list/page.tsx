"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { accountHeaders, requireSelectedAccountId } from "@/lib/accounts/context";
import { ValuationRegister, type JobPayment, type TemplateFieldName, type DisplayPreference } from "@/components/valuation-register";
import type { SavedField } from "@/lib/valuation/register";

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
  const [fields, setFields] = useState<SavedField[]>([]);
  const [templateFields, setTemplateFields] = useState<TemplateFieldName[]>([]);
  const [preferences, setPreferences] = useState<DisplayPreference[]>([]);
  const [payments, setPayments] = useState<JobPayment[]>([]);
  const [manager, setManager] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [exportMode, setExportMode] = useState<"all" | "range">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportDone, setExportDone] = useState("");
  const exportLocked = useRef(false);

  async function exportCertificates(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (exportLocked.current) return;
    if (exportMode === "range" && (!fromDate || !toDate || fromDate > toDate)) {
      setExportError("Choose a valid start and end date. End date cannot be before start date.");
      return;
    }
    exportLocked.current = true;
    setExporting(true);
    setExportError("");
    setExportDone("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Your session has expired. Sign in again to export certificates.");
      const headers = accountHeaders({ "Content-Type": "application/json" });
      headers.set("Authorization", "Bearer " + session.access_token);
      const response = await fetch("/api/certificates/export", {
        method: "POST", headers, cache: "no-store",
        body: JSON.stringify(exportMode === "all" ? {} : { from: fromDate, to: toDate }),
      });
      if (!response.ok) {
        let detail = "Could not export certificates. Please try a shorter date range.";
        try {
          const body = await response.json() as { error?: string };
          detail = body.error || detail;
        } catch { /* Use safe fallback. */ }
        throw new Error(detail);
      }
      const type = response.headers.get("Content-Type") || "";
      const extension = type.includes("application/zip") ? "zip" : "xlsx";
      const safeFile = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1];
      const filename = safeFile && /^certverify-certificates-[a-zA-Z0-9-]+\.(xlsx|zip)$/.test(safeFile)
        ? safeFile : "certverify-certificates." + extension;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setExportDone("Excel export ready. Open your Downloads folder to view the workbook.");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Could not download certificates.");
    } finally {
      exportLocked.current = false;
      setExporting(false);
    }
  }

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
        .eq("account_id",requireSelectedAccountId())
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

    const accountId=requireSelectedAccountId();
    const membership=await supabase.from("account_members").select("role")
      .eq("account_id",accountId).eq("user_id",user.id).eq("status","active").maybeSingle();
    const canManage=!!membership.data && ["owner","admin"].includes(membership.data.role);
    setManager(canManage);
    const certIds=rows.map(item=>item.id);
    const [snapshotsResult,templateResult,configResult,paymentResult]=await Promise.all([
      certIds.length ? supabase.from("certificate_field_values")
        .select("certificate_id,field_name,field_value,field_type,display_order")
        .in("certificate_id",certIds).limit(5000) : Promise.resolve({data:[],error:null}),
      supabase.from("certificate_fields").select("template_id,field_name,display_order").limit(2000),
      supabase.from("cv_valuation_display_config").select("template_id,field_names"),
      canManage ? supabase.from("cv_valuation_job_payments")
        .select("certificate_id,client_name,bank_name,branch_name,fee_amount,received_amount,due_date,notes")
        .eq("account_id",accountId) : Promise.resolve({data:[],error:null}),
    ]);
    const failures=[snapshotsResult,templateResult,configResult,paymentResult]
      .filter(result=>result.error).map(result=>result.error?.message);
    if(failures.length) setErrorMessage("Some register details could not be loaded: "+failures.join("; "));
    setFields(snapshotsResult.data??[]);
    setTemplateFields(templateResult.data??[]);
    setPreferences(configResult.data??[]);
    setPayments(paymentResult.data??[]);
    setCertificates(rows);
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadCertificates());
  }, []);

  return (
    <main className="cv-page">
      <div className="cv-shell cv-entrance">

        <div className="mb-5 flex flex-wrap gap-3">
          <Link href="/dashboard/certificates/bulk" className="cv-secondary text-sm">▦ &nbsp; Bulk imports / Upload Excel →</Link>
          {manager && <Link href="/dashboard/valuation-payments" className="cv-secondary text-sm">₹ &nbsp; Job payments &amp; receivables →</Link>}
        </div>
        <div className="cv-hero mb-7">
          <div className="cv-hero__body flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="cv-eyebrow mb-3">VERIFICATION LIBRARY</p>
            <h1 className="text-3xl font-bold !text-white">
              My Certificates
            </h1>

            <p className="mt-2 text-[#d2e5ec]">
              Search properties, clients and locations, manage job payments and open valuation reports.
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

        <section aria-label="Export certificates to Excel" className="cv-panel mb-7 space-y-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[#183449]">Export certificates to Excel</h2>
              <p className="mt-1 text-sm text-slate-600">
                Download your account&apos;s certificates as an Excel workbook. Each certificate template gets its own worksheet,
                with its custom fields, certificate number, status, creator, and verification link.
              </p>
            </div>
            <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">Excel .xlsx</span>
          </div>
          <form className="space-y-4" onSubmit={exportCertificates}>
            <fieldset className="flex flex-wrap gap-4">
              <legend className="mb-2 text-sm font-semibold text-slate-700">Which certificates?</legend>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="exportMode" value="all" checked={exportMode === "all"} onChange={() => setExportMode("all")} disabled={exporting} />
                All certificates
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="exportMode" value="range" checked={exportMode === "range"} onChange={() => setExportMode("range")} disabled={exporting} />
                Choose date range
              </label>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                From date
                <input aria-label="Export from date" className="cv-field mt-1" type="date" value={fromDate}
                  onChange={event => setFromDate(event.target.value)} disabled={exportMode === "all" || exporting} required={exportMode === "range"} />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                To date
                <input aria-label="Export to date" className="cv-field mt-1" type="date" value={toDate}
                  min={fromDate || undefined} onChange={event => setToDate(event.target.value)}
                  disabled={exportMode === "all" || exporting} required={exportMode === "range"} />
              </label>
            </div>
            <p className="text-xs text-slate-500">Dates are inclusive and follow India Standard Time. Exports include the certificates visible in your selected workspace, including revoked certificates.
              If a download exceeds 20,000 certificates, use smaller date ranges. More than 30 templates will be delivered as a ZIP containing multiple Excel workbooks.</p>
            <button type="submit" disabled={exporting} className="cv-primary disabled:cursor-wait disabled:opacity-60">
              {exporting ? "Preparing Excel export…" : "↓ Download Excel"}
            </button>
          </form>
          {exportError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{exportError}</p>}
          {exportDone && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{exportDone}</p>}
        </section>

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
          <ValuationRegister certificates={certificates} fields={fields}
            templateFields={templateFields} preferences={preferences}
            payments={payments} manager={manager}/>
        )}

      </div>
    </main>
  );
}