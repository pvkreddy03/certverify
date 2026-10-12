"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { selectedAccountId } from "@/lib/accounts/context";
import type { BrandingVersion } from "@/lib/branding/types";

export function IssuerBranding({ certificateId }: { certificateId?:string }) {
  const [branding,setBranding]=useState<BrandingVersion|null>(null);
  useEffect(()=>{
    let cancelled=false;
    const query=certificateId ? supabase.rpc("cv_certificate_issuer",{ p_certificate:certificateId }) : supabase.rpc("cv_current_branding");
    void query.then(({ data,error })=>{ if (!cancelled && !error) setBranding(data); });
    return ()=>{ cancelled=true; };
  },[certificateId]);
  if (!branding) return <p className="my-4 text-sm text-slate-600">{certificateId ? "Historical issuer branding awaits reconciliation." : "Branding is unavailable."}</p>;
  return <section aria-label={certificateId ? "Issuer at issuance" : "Account branding"} className="my-4 flex items-center gap-4 rounded border bg-white p-4">
    {branding.logo_asset_id && <Image src={`/api/branding/logo/${branding.logo_asset_id}?account=${selectedAccountId()}`} alt={`${branding.company_name} logo`} width={96} height={96} unoptimized className="h-24 w-24 object-contain" />}
    <div><h2 className="font-semibold">{branding.company_name}</h2><p className="whitespace-pre-wrap text-sm text-slate-600">{branding.professional_details}</p>{certificateId && <p className="text-xs text-slate-500">Issuer identity recorded at issuance</p>}</div>
  </section>;
}
