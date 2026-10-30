"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { accountHeaders } from "@/lib/accounts/context";

type Props = { templateId: string; templateName: string; className?: string };

export function DownloadTemplateExcel({ templateId, templateName, className = "" }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again to download this template.");
      const headers = accountHeaders();
      headers.set("Authorization", "Bearer " + session.access_token);
      const response = await fetch("/api/bulk/template?template=" + encodeURIComponent(templateId), {
        headers, cache: "no-store",
      });
      if (!response.ok) {
        let explanation = "Unable to generate the Excel template.";
        try { explanation = (await response.json()).error || explanation; } catch {}
        if (response.status === 404) explanation = "Add fields to this template before downloading its Excel format.";
        throw new Error(explanation);
      }
      const workbook = await response.blob();
      if (!workbook.size) throw new Error("The Excel template was empty. Please try again.");
      const objectUrl = URL.createObjectURL(workbook);
      const anchor = document.createElement("a");
      const safeTitle = templateName.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90) || "Certificate-Template";
      anchor.href = objectUrl;
      anchor.download = safeTitle + " - Excel Template.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download the Excel template.");
    } finally {
      setBusy(false);
    }
  }

  return <span className="inline-flex min-w-0 flex-col gap-1.5">
    <button type="button" onClick={() => void download()} disabled={busy}
      aria-label={"Download Excel format for " + templateName}
      className={"inline-flex items-center justify-center gap-2 rounded-xl border border-[#b9d9ce] bg-[#ebfaf4] px-4 py-2.5 text-sm font-bold text-[#0d7164] transition hover:bg-[#d7f4e8] disabled:cursor-wait disabled:opacity-60 " + className}>
      <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>
      </svg>
      {busy ? "Preparing Excel…" : "Download Excel Format"}
    </button>
    {error && <span role="alert" className="max-w-64 text-xs leading-5 text-red-700">{error}</span>}
  </span>;
}
