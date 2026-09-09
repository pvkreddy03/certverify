"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Template = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

type CertificateField = {
  id: string;
  field_name: string;
  field_type: string;
  is_required: boolean;
  is_public: boolean;
  display_order: number;
};

export default function TemplatePage() {
  const params = useParams();
  const templateId = params.id as string;

  const [template, setTemplate] = useState<Template | null>(null);
  const [fields, setFields] = useState<CertificateField[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingFields, setLoadingFields] = useState(true);
  const [showAddField, setShowAddField] = useState(false);

  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [isRequired, setIsRequired] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  const [savingField, setSavingField] = useState(false);
  const [message, setMessage] = useState("");

  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
const [savingEdit, setSavingEdit] = useState(false);

  async function loadTemplate() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("certificate_templates")
      .select("id, name, description, created_at")
      .eq("id", templateId)
      .single();

    if (error) {
      setMessage("Could not load template: " + error.message);
    } else {
      setTemplate(data);
    }

    setLoading(false);
  }

  async function loadFields() {
    setLoadingFields(true);

    const { data, error } = await supabase
      .from("certificate_fields")
      .select(
        "id, field_name, field_type, is_required, is_public, display_order"
      )
      .eq("template_id", templateId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setMessage("Could not load fields: " + error.message);
    } else {
      setFields(data || []);
    }

    setLoadingFields(false);
  }

  useEffect(() => {
    if (templateId) {
      loadTemplate();
      loadFields();
    }
  }, [templateId]);

  async function handleAddField(e: React.FormEvent) {
  e.preventDefault();

  if (!fieldName.trim()) {
    setMessage("Field name is required.");
    return;
  }

  setSavingField(true);
  setMessage("");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    setMessage("You must be logged in.");
    setSavingField(false);
    return;
  }

  // EDIT existing field
  if (editingFieldId) {
    setSavingEdit(true);

    const { error } = await supabase
      .from("certificate_fields")
      .update({
        field_name: fieldName.trim(),
        field_type: fieldType,
        is_required: isRequired,
        is_public: isPublic,
      })
      .eq("id", editingFieldId);

    if (error) {
      setMessage("Could not update field: " + error.message);
    } else {
      setFieldName("");
      setFieldType("text");
      setIsRequired(false);
      setIsPublic(true);
      setEditingFieldId(null);
      setMessage("Field updated successfully.");
      await loadFields();
    }

    setSavingEdit(false);
    setSavingField(false);
    return;
  }

  // ADD new field
  const nextDisplayOrder =
    fields.length > 0
      ? Math.max(...fields.map((field) => field.display_order)) + 1
      : 1;

  const { error } = await supabase
    .from("certificate_fields")
    .insert({
      user_id: user.id,
      template_id: templateId,
      field_name: fieldName.trim(),
      field_type: fieldType,
      is_required: isRequired,
      is_public: isPublic,
      display_order: nextDisplayOrder,
    });

  if (error) {
    setMessage("Could not add field: " + error.message);
  } else {
    setFieldName("");
    setFieldType("text");
    setIsRequired(false);
    setIsPublic(true);
    setShowAddField(false);
    setMessage("Field added successfully.");
    await loadFields();
  }

  setSavingField(false);
}
async function handleDeleteField(fieldId: string) {
  const confirmed = window.confirm(
    "Are you sure you want to delete this field?"
  );

  if (!confirmed) {
    return;
  }

  setMessage("");

  const { error } = await supabase
    .from("certificate_fields")
    .delete()
    .eq("id", fieldId);

  if (error) {
    setMessage("Could not delete field: " + error.message);
  } else {
    setMessage("Field deleted successfully.");
    await loadFields();
  }
}
async function moveField(fieldId: string, direction: "up" | "down") {
  const currentIndex = fields.findIndex((field) => field.id === fieldId);

  if (currentIndex === -1) {
    return;
  }

  const targetIndex =
    direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (targetIndex < 0 || targetIndex >= fields.length) {
    return;
  }

  const currentField = fields[currentIndex];
  const targetField = fields[targetIndex];

  const { error: currentError } = await supabase
    .from("certificate_fields")
    .update({ display_order: targetField.display_order })
    .eq("id", currentField.id);

  if (currentError) {
    setMessage("Could not move field: " + currentError.message);
    return;
  }

  const { error: targetError } = await supabase
    .from("certificate_fields")
    .update({ display_order: currentField.display_order })
    .eq("id", targetField.id);

  if (targetError) {
    setMessage("Could not move field: " + targetError.message);
    await loadFields();
    return;
  }

  setMessage("Field order updated.");
  await loadFields();
}
  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <p className="text-slate-500">Loading template...</p>
        </div>
      </main>
    );
  }

  if (!template) {
    return (
      <main className="min-h-screen bg-slate-50 px-6 py-10">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold text-slate-900">
            Template not found
          </h1>

          {message && (
            <p className="mt-3 text-sm text-red-600">{message}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">
          {template.name}
        </h1>

        <p className="mt-2 text-slate-600">
          {template.description || "No description"}
        </p>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Template ID</p>

          <p className="mt-1 break-all font-mono text-sm text-slate-900">
            {template.id}
          </p>
        </div>

        {message && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
            {message}
          </div>
        )}

        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Certificate Fields
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Add the information that should appear on certificates using
                this template.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowAddField(!showAddField);
                setMessage("");
              }}
              className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
            >
              + Add Field
            </button>
          </div>

          {(showAddField || editingFieldId) && (
            <form
              onSubmit={handleAddField}
              className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5"
            >
              <h3 className="text-lg font-semibold text-slate-900">
                Add Field
              </h3>

              <div className="mt-5">
                <label className="block text-sm font-medium text-slate-700">
                  Field Name
                </label>

                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder="e.g. Survey Number"
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>

              <div className="mt-5">
                <label className="block text-sm font-medium text-slate-700">
                  Field Type
                </label>

                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
              </div>

              <div className="mt-5 space-y-3">
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Required field
                </label>

                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show this field on the public verification page
                </label>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  type="submit"
                  disabled={savingField}
                  className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingField ? "Saving..." : "Save Field"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddField(false)}
                  className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="mt-6">
            {loadingFields ? (
              <p className="text-sm text-slate-500">Loading fields...</p>
            ) : fields.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
                <p className="font-medium text-slate-700">
                  No custom fields yet.
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  Click &quot;+ Add Field&quot; to create the first one.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 p-4"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        {index + 1}. {field.field_name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Type: {field.field_type} ·{" "}
                        {field.is_required ? "Required" : "Optional"} ·{" "}
                        {field.is_public ? "Public" : "Private"}
                      </p>
                    </div>
                    <button
  type="button"
  onClick={() => {
    setEditingFieldId(field.id);
    setFieldName(field.field_name);
    setFieldType(field.field_type);
    setIsRequired(field.is_required);
    setIsPublic(field.is_public);
    setShowAddField(false);
    setMessage("");
  }}
  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
>
  Edit
</button>
<button
  type="button"
  onClick={() => handleDeleteField(field.id)}
  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
>
  Delete
</button>
<button
  type="button"
  onClick={() => moveField(field.id, "up")}
  disabled={index === 0}
  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
>
  ↑
</button>

<button
  type="button"
  onClick={() => moveField(field.id, "down")}
  disabled={index === fields.length - 1}
  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
>
  ↓
</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}