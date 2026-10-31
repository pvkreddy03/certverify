"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

import { LocationPicker } from "@/components/location-picker";
import {parseGeoLocation} from "@/lib/geo/location";
import { listReportFormats, type ReportFormat } from "@/lib/reports/private-storage";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { matchingCoverFormats, type LinkedCoverFormat } from "@/lib/cover-letters/format-options";

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
  const [coverFormats, setCoverFormats] = useState<LinkedCoverFormat[]>([]);
  const [coverLoading, setCoverLoading] = useState(false);
  const [coverLoadError, setCoverLoadError] = useState("");
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [selectedCoverFormatId, setSelectedCoverFormatId] = useState("");
  const compatibleCoverFormats = matchingCoverFormats(
    coverFormats, selectedTemplateId || null,
    includeWordReport && selectedFormatId ? selectedFormatId : null
  );
  const effectiveCoverFormatId = compatibleCoverFormats.some(item => item.id === selectedCoverFormatId)
    ? selectedCoverFormatId : compatibleCoverFormats[0]?.id ?? "";
  useEffect(() => {
    let live = true;
    if (!selectedTemplateId) return;
    void Promise.resolve().then(() => {
      if (!live) return;
      setCoverLoading(true);
      setCoverLoadError("");
      setCoverFormats([]);
      setIncludeCoverLetter(false);
      setSelectedCoverFormatId("");
    });
    void supabase.from("cv_cover_letter_templates")
      .select("id,name,template_id,report_format_id")
      .eq("account_id", requireSelectedAccountId())
      .order("name")
      .then(({ data, error }) => {
        if (!live) return;
        if (error) throw new Error(error.message);
        setCoverFormats((data ?? []) as LinkedCoverFormat[]);
      })
      .catch(error => {
        if (!live) return;
        setCoverFormats([]);
        setCoverLoadError(error instanceof Error ? error.message : "Cover formats unavailable.");
      })
      .finally(() => { if (live) setCoverLoading(false); });
    return () => { live = false; };
  }, [selectedTemplateId]);

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
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsLoadError, setFieldsLoadError] = useState("");
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
    let active = true;
    if (!selectedTemplateId) {
      void Promise.resolve().then(() => {
        if (active) {
          setCustomFields([]); setCustomFieldValues({}); setFieldsLoading(false); setFieldsLoadError("");
        }
      });
      return () => { active = false; };
    }
    void Promise.resolve().then(() => {
      if (active) {
        setFieldsLoading(true); setFieldsLoadError("");
        setCustomFields([]); setCustomFieldValues({});
      }
    });
    void getCertificateFields(selectedTemplateId).then(fields => {
      if (!active) return;
      setCustomFields(fields); setCustomFieldValues({});
    }).catch(error => {
      if (!active) return;
      setFieldsLoadError(error instanceof Error ? error.message : "Could not load certificate fields.");
    }).finally(() => { if (active) setFieldsLoading(false); });
    return () => { active = false; };
  }, [selectedTemplateId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Lock synchronously: a second click cannot race the React disabled state.
    if (submitLocked.current || createdRecordId) return;
    submitLocked.current = true;
    setMessage("");
    setSaving(true);


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
      if (!selectedTemplateId || fieldsLoading || fieldsLoadError) throw new Error("Certificate fields are not ready. Select a template and try again.");
      if (includeCoverLetter && (coverLoading || !effectiveCoverFormatId)) {
        throw new Error("Choose a compatible saved cover-letter format before saving.");
      }
      if (includeWordReport && (formatLoading || !selectedFormatId)) {
        throw new Error("Choose a Word report format before saving.");
      }
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
        cover_letter_format_id: includeCoverLetter ? effectiveCoverFormatId : null,
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
      <div className="cv-shell !max-w-6xl cv-entrance">
        <div className="cv-hero mb-7">
          <div className="cv-hero__body">
            <p className="cv-eyebrow mb-3">SINGLE CERTIFICATE</p>
          <h1 className="text-3xl font-bold !text-white">
            Create Certificate
          </h1>

          <p className="mt-3 text-[#d0e5eb]">
            Select a template and enter the required details. Your verification ID and QR code are created automatically when you save.
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
                setMessage("");
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

          </div>

          {selectedTemplateId && !formatLoading && formats.length === 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9e8e9] bg-[#f3f9f8] px-5 py-4">
            <div>
              <p className="text-sm font-bold text-[#1d4451]">Want to generate a Word report?</p>
              <p className="mt-1 text-xs text-slate-600">This template has no saved report formats yet. You can create a Word layout for a report, opinion, certificate or other professional document, then reuse it.</p>
              {formatLoadError && <p className="mt-1 text-xs text-amber-800">{formatLoadError}</p>}
            </div>
            <Link href={`/dashboard/templates/${selectedTemplateId}/report?format=__new__`}
              className="rounded-lg border border-[#abd7d1] bg-white px-4 py-2.5 text-sm font-bold text-[#14746c] hover:bg-[#e7faf2]">+ Create report format</Link>
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

          {selectedTemplateId && <div className="rounded-xl border border-[#b8ded8] bg-[#f1faf8] p-5">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-900">
              <input type="checkbox" checked={includeCoverLetter} disabled={saving || coverLoading}
                onChange={event => setIncludeCoverLetter(event.target.checked)} />
              Prepare a Cover Letter too (optional)
            </label>
            <p className="mt-2 text-xs text-slate-600">
              Select the saved letterhead and QR placement now. The completed cover is generated from this certificate later—no duplicate PDF is stored.
              {includeWordReport && " Download the cover and full Word report as one PDF from Certificate Details."}
            </p>
            {coverLoading && <p role="status" className="mt-2 text-xs text-slate-600">Loading matching cover-letter formats…</p>}
            {coverLoadError && <p role="alert" className="mt-2 text-xs text-amber-800">Could not load cover formats: {coverLoadError}</p>}
            {includeCoverLetter && compatibleCoverFormats.length > 0 && <label className="mt-4 block text-sm font-semibold text-slate-900">
              Choose Cover Letter Format
              <select aria-label="Choose cover letter format" className="cv-field mt-2"
                value={effectiveCoverFormatId} onChange={event => setSelectedCoverFormatId(event.target.value)}
                disabled={saving} required>
                {compatibleCoverFormats.map(format => <option key={format.id} value={format.id}>
                  {format.name}{format.report_format_id ? " · Report-linked" : format.template_id ? " · Template-linked" : " · General"}
                </option>)}
              </select>
            </label>}
            {!coverLoading && compatibleCoverFormats.length === 0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3">
              <p className="max-w-md text-xs text-slate-600">
                {coverFormats.length ? "No saved cover format matches the current template and Word report selection." :
                  "No cover-letter format is saved yet. Set up a reusable letterhead with a QR position once."}
              </p>
              <Link href={"/dashboard/cover-letters?template=" + encodeURIComponent(selectedTemplateId)}
                className="rounded-lg border border-teal-700 px-3 py-2 text-xs font-bold text-teal-800">
                + Create Cover Letter Format
              </Link>
            </div>}
          </div>}

          {selectedTemplateId && fieldsLoading && <p role="status" className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">Loading certificate fields…</p>}
          {fieldsLoadError && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Could not load required certificate fields: {fieldsLoadError}. Choose the template again before saving.
          </div>}

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
            disabled={saving || loadingTemplates || fieldsLoading || Boolean(fieldsLoadError) || Boolean(createdRecordId)}
            className="cv-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Certificate"}
          </button>
        </form>
      </div>
    </main>
  );
}