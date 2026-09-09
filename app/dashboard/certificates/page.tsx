"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  generateCertificateId,
  createCertificate,
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

const [certificateId, setCertificateId] = useState("");
const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
const [selectedTemplateId, setSelectedTemplateId] = useState("");
const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [client, setClient] = useState("");
  const [valuationDate, setValuationDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [propertyArea, setPropertyArea] = useState("");
  const [location, setLocation] = useState("");
  const [pricePerSqMeter, setPricePerSqMeter] = useState("");
  const [totalPropertyValue, setTotalPropertyValue] = useState("");
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
  async function loadCertificateId() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setMessage("You must be logged in.");
    return;
  }

  const { data, error } = await supabase.rpc("generate_certificate_id");

  if (error) {
    setMessage("Could not generate Certificate ID: " + error.message);
    return;
  }

  setCertificateId(data);
}
useEffect(() => {
  loadCertificateId();
  loadTemplates();
}, []);
useEffect(() => {
  async function loadCustomFields() {
    if (!selectedTemplateId) {
      setCustomFields([]);
      return;
    }

    try {
      const fields = await getCertificateFields(selectedTemplateId);
      setCustomFields(fields);
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
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setMessage("");
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in.");
      setSaving(false);
      return;
    }

    try {
 const certificate = await createCertificate({
  user_id: user.id,
  certificate_id: certificateId,
  template_id: selectedTemplateId,
  status,
});
const fieldValues = customFields.map((field) => ({
  certificate_id: certificate.id,
  field_name: field.field_name,
  field_type: field.field_type,
  field_value: customFieldValues[field.id] ?? null,
  is_public: field.is_public,
  display_order: field.display_order,
}));

await createCertificateFieldValues(fieldValues);
} catch (error) {
  setMessage(
    error instanceof Error
      ? error.message
      : "Could not save certificate."
  );
  setSaving(false);
  return;
}

    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Create Certificate
          </h1>

          <p className="mt-2 text-slate-600">
            Enter the property valuation details below.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl bg-white p-8 shadow-sm"
        >
          <div>
  <label className="mb-2 block text-sm font-medium text-slate-700">
    Certificate Template
  </label>

  <select
    value={selectedTemplateId}
    onChange={(e) => setSelectedTemplateId(e.target.value)}
    disabled={loadingTemplates}
    required
    className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
  >
    <option value="">
      {loadingTemplates ? "Loading templates..." : "Select a template"}
    </option>

    {templates.map((template) => (
      <option key={template.id} value={template.id}>
        {template.name}
      </option>
    ))}
  </select>
</div>
               <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Certificate ID
            </label>

            <input
              type="text"
              value={certificateId}
              readOnly
              placeholder="Generating..."
              required
              className="w-full rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-slate-700 outline-none"
            />
          </div>

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
  className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
/>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Status
            </label>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Revoked">Revoked</option>
            </select>
          </div>

          {message && (
            <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-slate-900 px-6 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Certificate"}
          </button>
        </form>
      </div>
    </main>
  );
}