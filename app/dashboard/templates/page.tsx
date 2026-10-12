
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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

  async function loadTemplates() {
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

    const { error } = await supabase
      .from("certificate_templates")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description.trim() || null,
      });

    if (error) {
      setMessage("Could not create template: " + error.message);
      setSaving(false);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">

        <div className="flex items-center justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="mb-4 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              ← Back to Dashboard
            </button>

            <h1 className="text-3xl font-bold text-slate-900">
              Templates
            </h1>

            <p className="mt-2 text-slate-600">
              Create and manage your certificate templates.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowCreateForm(!showCreateForm);
              setMessage("");
            }}
            className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800"
          >
            + Create Template
          </button>
        </div>

        {message && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
            {message}
          </div>
        )}

        {showCreateForm && (
          <form
            onSubmit={handleCreateTemplate}
            className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-slate-900">
              Create Template
            </h2>

            <div className="mt-5">
              <label className="block text-sm font-medium text-slate-700">
                Template Name
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Land & Building Valuation"
                className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
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
                className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white hover:bg-slate-800 disabled:opacity-50"
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
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              Loading templates...
            </div>
          ) : templates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
              <h2 className="text-xl font-semibold text-slate-900">
                No templates yet
              </h2>

              <p className="mt-2 text-slate-500">
                Create your first certificate template to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <a
                  key={template.id}
                  href={`/dashboard/templates/${template.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:border-slate-400 hover:shadow-md"
                >
                  <h2 className="text-lg font-semibold text-slate-900">
                    {template.name}
                  </h2>

                  <p className="mt-2 text-sm text-slate-500">
                    {template.description || "No description"}
                  </p>

                  <p className="mt-4 text-xs text-slate-400">
                    Created{" "}
                    {new Date(template.created_at).toLocaleDateString()}
                  </p>
                </a>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}