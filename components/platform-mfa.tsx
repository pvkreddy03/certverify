"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

export function PlatformMfa({ children }: { children:ReactNode }) {
  const [ready,setReady]=useState(false); const [factor,setFactor]=useState<string|null>(null);
  const [qr,setQr]=useState(""); const [code,setCode]=useState(""); const [message,setMessage]=useState("Checking secure session…");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    async function load() {
      const { data,error }=await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (data.currentLevel==="aal2") { if (!cancelled) setReady(true);return; }
      const factors=await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      if (!cancelled) { setFactor(factors.data.totp.find((item)=>item.status==="verified")?.id ?? null);setMessage("MFA verification is required for platform branding review."); }
    }
    void load().catch(()=>{ if (!cancelled) setMessage("MFA session could not be checked. Sign in again."); });
    return()=>{ cancelled=true; };
  },[]);
  async function enroll() {
    setBusy(true);
    const { data,error }=await supabase.auth.mfa.enroll({ factorType:"totp",friendlyName:"CertVerify platform approval" });
    if (error) setMessage("Authenticator setup failed. Check existing MFA factors or sign in again.");
    else { setFactor(data.id);setQr(data.totp.qr_code);setMessage("Scan with your authenticator app and enter its current code."); }
    setBusy(false);
  }
  async function verify(event:React.FormEvent) {
    event.preventDefault();if (!factor) return;setBusy(true);
    const { error }=await supabase.auth.mfa.challengeAndVerify({ factorId:factor,code });
    if (error) setMessage("The authenticator code could not be verified.");else { setQr("");setCode("");setReady(true); }
    setBusy(false);
  }
  if (ready) return children;
  return <section className="space-y-4 rounded border p-6"><h2 className="text-xl font-semibold">Platform MFA verification</h2><p role="status">{message}</p>
    {qr && <Image src={qr.startsWith("data:") ? qr : `data:image/svg+xml;utf8,${encodeURIComponent(qr)}`} alt="Authenticator setup QR" width={200} height={200} unoptimized />}
    {!factor ? <button disabled={busy} onClick={()=>{ void enroll(); }} className="rounded bg-blue-700 px-4 py-2 text-white">Set up authenticator</button> : <form onSubmit={verify}><label>Authenticator code<input value={code} onChange={(event)=>setCode(event.target.value)} inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code" className="ml-3 border p-2" /></label><button disabled={busy} className="ml-3 rounded bg-blue-700 px-4 py-2 text-white">Verify MFA</button></form>}
  </section>;
}
