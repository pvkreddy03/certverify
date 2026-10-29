"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { IssuerBranding } from "@/components/issuer-branding";
import { LocationPicker } from "@/components/location-picker";
import {parseGeoLocation} from "@/lib/geo/location";
import { listReportFormats, type ReportFormat } from "@/lib/reports/private-storage";

import {
  generateCertificateId,
  createCertificate,
  getCurrentAccountId,
} from "@/lib/repositories/certificates";

import {
  getCertificateTemplates,
  type CertificateTemplate,
} from "@/lib/repositories/templates";

import {
  getCertificateFields,
  createCertificateFieldValues,
  type CertificateField,
} from "@/lib/repositories/certificate-fields";

export default function CertificatesPage() {
  const router = useRouter();
  const submitLocked = useRef(false);
  const [createdRecordId, setCreatedRecordId] = useState<string | null>(null);
  const [certificateId, setCertificateId] = useState("");
  const [replacementId, setReplacementId] = useState<string | null>(null);
  useEffect(() => {
    const replaces = new URLSearchParams(window.location.search).get("replaces");
    if (replaces) void Promise.resolve().then(() => setReplacementId(replaces));
  }, []);

  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  useEffect(() => {
    const template = new URLSearchParams(window.location.search).get("template");
    if (template && /^[0-9a-f-]{36}$/i.test(template)) void Promise.resolve().then(() => setSelectedTemplateId(template));
  }, []);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [formats, setFormats] = useState<ReportFormat[]>([]);
  const [formatLoading, setFormatLoading] = useState(false);
  const [formatLoadError, setFormatLoadError] = useState("");
  const [includeWordReport, setIncludeWordReport] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState("");
  useEffect(() => {
    let active = true;
    if (!selectedTemplateId) return;
    void Promise.resolve().then(() => {
      if (active) { setFormats([]); setFormatLoadError(""); setFormatLoading(true); }
    });
    void listReportFormats(selectedTemplateId).then(items => {
      if (!active) return;
      setFormats(items);
      setSelectedFormatId(items[0]?.id ?? "");
      setIncludeWordReport(false);
    }).catch(error => {
      if (!active) return;
      setFormats([]);
      setFormatLoadError(error instanceof Error ? error.message : "Word formats are unavailable.");
    }).finally(() => { if (active) setFormatLoading(false); });
    return () => { active = false; };
  }, [selectedTemplateId]);


  const [status, setStatus] = useState("Active");

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [customFields, setCustomFields] = useState<CertificateField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<
    Record<string, string>
  >({});

  async function loadTemplates() {
    try {
      const data = await getCertificateTemplates();
      setTemplates(data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load templates."
      );
    } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTemplates());
  }, []);

  useEffect(() => {
    async function loadCustomFields() {
      if (!selectedTemplateId) {
        setCustomFields([]);
        setCustomFieldValues({});
        return;
      }

      try {
        const fields = await getCertificateFields(selectedTemplateId);
        setCustomFields(fields);
        setCustomFieldValues({});
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Could not load certificate fields."
        );
      }
    }

    loadCustomFields();
  }, [selectedTemplateId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Lock synchronously: a second click cannot race the React disabled state.
    if (submitLocked.current || createdRecordId) return;
    submitLocked.current = true;
    setMessage("");
    setSaving(true);
    setCertificateId("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in.");
      setSaving(false);
      submitLocked.current = false;
      return;
    }

    let insertedId: string | null = null;
    try {
      for (const field of customFields) {
        if (field.field_type === "location" && customFieldValues[field.id]) {
          if (!parseGeoLocation(customFieldValues[field.id])) throw new Error("Invalid map location for "+field.field_name);
        }
      }
      /*
       * Find the active account for the logged-in user.
       */
      const accountId = await getCurrentAccountId();

      /*
       * Generate the Certificate ID only when the user
       * actually saves the certificate.
       */
      const newCertificateId = await generateCertificateId(accountId);

      /*
       * Create the certificate and connect it to:
       * - the logged-in user
       * - the user's account
       * - the selected template
       */
      const certificate = await createCertificate({
        user_id: user.id,
        account_id: accountId,
        certificate_id: newCertificateId,
        template_id: selectedTemplateId,
        status,
        replaces_certificate_id: replacementId,
        report_format_id: includeWordReport && selectedFormatId ? selectedFormatId : null,
      });
      insertedId = certificate.id;
      setCreatedRecordId(certificate.id);

      /*
       * Save custom certificate field values.
       */
      if (customFields.length > 0) {
        const fieldValues = customFields.map((field) => ({
          certificate_id: certificate.id,
          field_name: field.field_name,
          field_type: field.field_type,
          field_value: customFieldValues[field.id] ?? null,
          is_public: field.is_public,
          display_order: field.display_order,
        }));

        await createCertificateFieldValues(fieldValues);
      }

      setCertificateId(newCertificateId);
      // Replace the form history entry to prevent another submission on Back.
      router.replace(`/dashboard/certificates/${certificate.id}?created=1`);
    } catch (error) {
      // The main record may already exist if saving the dynamic fields failed.
      // Never re-enable submission in that case: it would mint another ID.
      setMessage(
        insertedId
          ? "The certificate was created, but some details could not be saved. Open the existing certificate to review it. Do not submit again."
          : error instanceof Error ? error.message : "Could not save certificate."
      );
      if (!insertedId) submitLocked.current = false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="cv-page">
      <div className="cv-shell !max-w-5xl cv-entrance">
        <div className="cv-hero mb-7">
          <div className="cv-hero__body">
            <p className="cv-eyebrow mb-3">SINGLE CERTIFICATE</p>
          <h1 className="text-3xl font-bold !text-white">
            Create Certificate
          </h1>

          <p className="mt-3 text-[#d0e5eb]">
            Choose your template, enter certificate details, and generate a unique verification ID.
          </p>
          </div>
        </div>

        <div className="cv-card cv-card--interactive mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="cv-glow-icon"><svg aria-hidden="true" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16M15 10v10"/></svg></span>
            <div><p className="font-extrabold text-[#1d3449]">Have an Excel spreadsheet?</p>
            <p className="mt-1 text-xs text-[#6b7d95]">Upload, review and create up to 100 certificates in one batch.</p></div>
          </div>
          <Link href="/dashboard/certificates/bulk" className="cv-primary text-sm">Import Excel →</Link>
        </div>
        <IssuerBranding />
        {replacementId && <p className="mb-6 rounded border border-blue-200 bg-blue-50 p-4">This new certificate will be linked to the revoked original. The original remains revoked and its history is preserved.</p>}
        <form
          onSubmit={handleSubmit}
          className="cv-panel space-y-6 p-5 sm:p-8"
        >
          {/* Certificate Template */}
          <div>
            <label htmlFor="certificate-template" className="mb-2 block text-sm font-medium text-slate-700">
              Certificate Template
            </label>

            <select
              id="certificate-template"
              value={selectedTemplateId}
              onChange={(e) => {
                if (e.target.value === "__create__") {
                  router.push("/dashboard/templates?create=1&from=certificate");
                  return;
                }
                setSelectedTemplateId(e.target.value);
              }}
              disabled={loadingTemplates || saving}
              required
              className="cv-field"
            >
              <option value="">
                {loadingTemplates
                  ? "Loading templates..."
                  : "Select a template"}
              </option>

              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
              <option value="__create__">＋ Create a new template…</option>
            </select>
            <Link href="/dashboard/templates?create=1&from=certificate" className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline">
              + Create and configure a new template
            </Link>
          </div>

          {selectedTemplateId && !formatLoading && formats.length === 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9e8e9] bg-[#f3f9f8] px-5 py-4">
            <div>
              <p className="text-sm font-bold text-[#1d4451]">Want to generate a Word report?</p>
              <p className="mt-1 text-xs text-slate-600">This template has no saved Word formats yet. You can create SBI, Canara, Visa or another .docx layout once, then reuse it.</p>
              {formatLoadError && <p className="mt-1 text-xs text-amber-800">{formatLoadError}</p>}
            </div>
            <Link href={`/dashboard/templates/${selectedTemplateId}/report?format=__new__`}
              className="rounded-lg border border-[#abd7d1] bg-white px-4 py-2.5 text-sm font-bold text-[#14746c] hover:bg-[#e7faf2]">+ Create Word format</Link>
          </div>}
          {formats.length > 0 && <div className="rounded-xl border border-teal-200 bg-teal-50 p-5">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-900">
              <input type="checkbox" checked={includeWordReport} disabled={saving}
                onChange={event => setIncludeWordReport(event.target.checked)} />
              Prepare a Word report too (optional)
            </label>
            <p className="mt-2 text-xs text-slate-600">Leave unchecked for QR-only issuance. All report formats reuse the fields below; nothing extra is required.</p>
            {includeWordReport && <label className="mt-4 block text-sm font-semibold">
              Choose report format
              <select aria-label="Choose report format" className="cv-field mt-2" value={selectedFormatId}
                onChange={event => setSelectedFormatId(event.target.value)} disabled={saving} required>
                {formats.map(item => <option key={item.id} value={item.id}>{item.format_name}</option>)}
              </select>
            </label>}
          </div>}

          {/* Certificate ID */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Certificate ID
            </label>

            <input
              type="text"
              value={certificateId}
              readOnly
              placeholder="Generated when certificate is saved"
              className="cv-field !bg-[#f3f6fa] text-[#748399]"
            />

            <p className="mt-2 text-xs text-slate-500">
              Certificate ID is automatically generated when you save the
              certificate.
            </p>
          </div>

          {/* Custom Fields */}
          {customFields.length > 0 && (
            <div className="border-t border-slate-200 pt-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                Certificate Details
              </h2>

              <div className="grid gap-6 md:grid-cols-2">
                {customFields.map((field) => (
                  <div key={field.id} className={field.field_type === "location" ? "md:col-span-2 min-w-0" : "min-w-0"}>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      {field.field_name}

                      {field.is_required && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>

                    {field.field_type === "location" ? (
                      <LocationPicker name={field.field_name} value={customFieldValues[field.id] ?? ""} onChange={value=>setCustomFieldValues(previous=>({...previous,[field.id]:value}))} disabled={saving} required={field.is_required}/>
                    ) : <input
                      type={
                        field.field_type === "number"
                          ? "number"
                          : field.field_type === "date"
                            ? "date"
                            : "text"
                      }
                      value={customFieldValues[field.id] ?? ""}
                      onChange={(e) =>
                        setCustomFieldValues((previous) => ({
                          ...previous,
                          [field.id]: e.target.value,
                        }))
                      }
                      placeholder={`Enter ${field.field_name}`}
                      required={field.is_required}
                      disabled={saving}
                      className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                    />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Status
            </label>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={saving}
              className="cv-field"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>

          {/* Message */}
          {message && (
            <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          {createdRecordId && (
            <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              A certificate record already exists. <Link href={`/dashboard/certificates/${createdRecordId}`} className="font-semibold underline">View this certificate and download its QR code</Link>. Do not resubmit.
            </p>
          )}

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving || loadingTemplates || Boolean(createdRecordId)}
            className="cv-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Certificate"}
          </button>
        </form>
      </div>
    </main>
  );
}