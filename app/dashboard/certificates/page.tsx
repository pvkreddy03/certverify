"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { IssuerBranding } from "@/components/issuer-branding";

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
    if (template && /^[0-9a-f-]{36}$/i.test(template)) setSelectedTemplateId(template);
  }, []);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

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
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Create Certificate
          </h1>

          <p className="mt-2 text-slate-600">
            Enter the certificate details below.
          </p>
        </div>

        <IssuerBranding />
        {replacementId && <p className="mb-6 rounded border border-blue-200 bg-blue-50 p-4">This new certificate will be linked to the revoked original. The original remains revoked and its history is preserved.</p>}
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl bg-white p-8 shadow-sm"
        >
          {/* Certificate Template */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Certificate Template
            </label>

            <select
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
              className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
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
              className="w-full rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-slate-700 outline-none"
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
                  <div key={field.id}>
                    <label className="mb-2 block text-sm font-medium text-slate-700">
                      {field.field_name}

                      {field.is_required && (
                        <span className="text-red-500"> *</span>
                      )}
                    </label>

                    <input
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
                    />
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
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
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
            className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Certificate"}
          </button>
        </form>
      </div>
    </main>
  );
}