
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { DownloadTemplateExcel } from "@/components/download-template-excel";

type Template = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export default function TemplatesPage() {
  const router = useRouter();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [fromCertificate, setFromCertificate] = useState(false);
  const [fromBulk, setFromBulk] = useState(false);
  const [canManageTemplates, setCanManageTemplates] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    void Promise.resolve().then(() => {
      if (query.get("create") === "1") setShowCreateForm(true);
      if (query.get("from") === "certificate" || query.get("from") === "bulk") setFromCertificate(true);
      if (query.get("from") === "bulk") setFromBulk(true);
    });
  }, []);

  async function loadTemplates() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in.");
      setLoading(false);
      return;
    }

    const { data: member, error: memberError } = await supabase
      .from("account_members")
      .select("role, can_manage_templates")
      .eq("account_id", requireSelectedAccountId())
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();
    const permitted = !memberError && !!member &&
      (member.role === "owner" || member.role === "admin" || member.can_manage_templates === true);
    setCanManageTemplates(permitted);

    const { data, error } = await supabase
      .from("certificate_templates")
      .select("id, name, description, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMessage("Could not load templates: " + error.message);
    } else {
      setTemplates(data || []);
    }

    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(() => loadTemplates());
  }, []);

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();

    if (!canManageTemplates) {
      setMessage("Ask your organization administrator to create this template, or grant you template creation access from Team → Members.");
      return;
    }

    if (!name.trim()) {
      setMessage("Template name is required.");
      return;
    }

    setSaving(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in.");
      setSaving(false);
      return;
    }

    const { data: created, error } = await supabase
      .from("certificate_templates")
      .insert({
        user_id: user.id,
        account_id: requireSelectedAccountId(),
        name: name.trim(),
        description: description.trim() || null,
      })
      .select("id")
      .single();

    if (error) {
      setMessage(error.code === "42501" ? "Ask your organization administrator to grant template creation access under Team → Members." : "Could not create template: " + error.message);
      setSaving(false);
      return;
    }

    if (!created?.id) {
      setMessage("Template was saved, but its details could not be opened. Check your template list before retrying.");
      setSaving(false);
      return;
    }
    // Configure the fields before issuing a certificate using this template.
    router.push(`/dashboard/templates/${created.id}${fromBulk ? "?from=bulk" : fromCertificate ? "?from=certificate" : ""}`);
  }

  return (
    <main className="cv-page">
      <div className="cv-shell space-y-6 cv-entrance">

        <div className="cv-hero">
          <div className="cv-hero__body flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="cv-eyebrow mb-2">REUSABLE RECORD LAYOUTS</p><h1 className="text-3xl font-bold !text-white">
              Templates
            </h1>

            <p className="mt-2 max-w-xl text-[#d2e5ec]">
              Define reusable fields for certificates and professional records. Manage document layouts separately under Report Formats.
            </p>
          </div>

          {canManageTemplates && <button
            type="button"
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setMessage("");
            }}
            className="cv-primary shrink-0 !border-[#35bea9] !bg-[#47d5c2] !text-[#082b35]"
          >
            + Create Template
          </button>}
          </div>
        </div>

        {!loading && !canManageTemplates && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><strong>Template creation requires permission.</strong> Ask your organization administrator to create a template for you, or grant you template creation access in Team → Members. You can still use existing templates to issue certificates.</div>}

        {message && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
            {message}
          </div>
        )}

        {showCreateForm && canManageTemplates && (
          <form
            onSubmit={handleCreateTemplate}
            className="cv-panel mt-6 p-6 sm:p-8"
          >
            <div className="flex items-center gap-3"><span className="cv-step">✦</span><h2 className="cv-section-title">Create a new template</h2></div>
            {fromCertificate && <p className="mt-2 text-sm text-blue-800">After creating the template, add your certificate fields, then return to {fromBulk ? "Bulk Excel" : "certificate creation"}.</p>}

            <div className="mt-5">
              <label className="block text-sm font-medium text-slate-700">
                Template Name
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Client Certificate, Compliance Record, Inspection Report"
                className="cv-field mt-2"
              />
            </div>

            <div className="mt-5">
              <label className="block text-sm font-medium text-slate-700">
                Description
              </label>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="cv-primary disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Template"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setName("");
                  setDescription("");
                  setMessage("");
                }}
                className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mt-8">
          {loading ? (
            <div className="cv-panel p-8 text-center text-slate-500">
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="cv-panel border-dashed p-12 text-center">
              <h2 className="text-xl font-semibold text-slate-900">
                No templates yet
              </h2>

              <p className="mt-2 text-slate-500">
                {canManageTemplates ? "Create your first certificate template to get started." : "No templates are available yet. Ask your organization administrator to create one or grant you template creation access."}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <article
                  key={template.id}
                  className="cv-card cv-card--interactive group p-6"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#e3f8f1] text-[#07786e]">
                    <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.7"><rect x="3" y="3" width="7" height="7" rx="1.2"/><rect x="14" y="3" width="7" height="7" rx="1.2"/><rect x="3" y="14" width="7" height="7" rx="1.2"/><rect x="14" y="14" width="7" height="7" rx="1.2"/></svg>
                  </div><h2 className="text-lg font-extrabold text-[#243750] group-hover:text-[#087c70]">
                    {template.name}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    {template.description || "No description"}
                  </p>

                  <p className="mt-4 text-xs text-slate-400">
                    Created{" "}
                    {new Date(template.created_at).toLocaleDateString()}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Link href={`/dashboard/templates/${template.id}`}
                      className="inline-flex items-center rounded-xl border border-[#c5dbe2] px-4 py-2.5 text-sm font-bold text-[#275367] hover:bg-[#f2f8fa]">
                      Edit Fields
                    </Link>
                    <DownloadTemplateExcel templateId={template.id} templateName={template.name} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}