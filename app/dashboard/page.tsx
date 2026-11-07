"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ProfileAvatarLink } from "@/components/profile-avatar-link";
import { requireSelectedAccountId } from "@/lib/accounts/context";

type RecentCertificate={id:string;certificate_id:string;status:string;created_at:string;template_name:string|null};
type IconName="certificate"|"template"|"scan"|"excel"|"arrow"|"shield";

function Graphic({name,className="h-6 w-6"}:{name:IconName;className?:string}){
  const paths:Record<IconName,React.ReactNode>={
    certificate:<><path d="M6 2h9l5 5v14H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M15 2v6h5M8 13h8M8 17h5"/></>,
    template:<><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    scan:<><path d="M7 3H4a1 1 0 0 0-1 1v3M17 3h3a1 1 0 0 1 1 1v3M3 17v3a1 1 0 0 0 1 1h3M21 17v3a1 1 0 0 1-1 1h-3M3 12h18"/><path d="m9 12 2 2 4-4"/></>,
    excel:<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18M15 9v12"/></>,
    arrow:<><path d="M5 12h14m-7-7 7 7-7 7"/></>,
    shield:<><path d="m12 2 8 4v6c0 5.4-3.5 8.6-8 10-4.5-1.4-8-4.6-8-10V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></>,
  };
  return <svg className={className} aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Metric({label,count,help,kind,color}:{label:string;count:number|null;help:string;kind:IconName;color:string}){
  return <div className="cv-card cv-stat p-6">
    <div className="relative z-10 flex items-start justify-between">
      <div><p className="text-sm font-semibold text-[#65758e]">{label}</p><p className="cv-stat__number mt-3">{count===null?"—":count.toLocaleString("en-IN")}</p></div>
      <div className={"cv-glow-icon "+color}><Graphic name={kind}/></div>
    </div>
    <p className="relative z-10 mt-4 text-xs text-[#78859a]">{help}</p>
  </div>;
}

export default function DashboardPage(){
  const [canManageFees,setCanManageFees]=useState(false);
  const [certificateCount,setCertificateCount]=useState<number|null>(null);
  const [templateCount,setTemplateCount]=useState<number|null>(null);
  const [verificationCount,setVerificationCount]=useState<number|null>(null);
  const [recent,setRecent]=useState<RecentCertificate[]>([]);
  const [loading,setLoading]=useState(true);
  const [showLetterheadSetup,setShowLetterheadSetup]=useState(false);
  const [setupAccountId,setSetupAccountId]=useState("");

  useEffect(()=>{
    let active=true;
    async function load(){
      const {data:{user}}=await supabase.auth.getUser();
      if(!user||!active){if(active)setLoading(false);return;}
      const accountId=requireSelectedAccountId();
      const role=await supabase.from("account_members").select("role").eq("account_id",accountId).eq("user_id",user.id).eq("status","active").maybeSingle();
      if(!role.error)setCanManageFees(["owner","admin"].includes(role.data?.role??""));
      const [certs,templates,verifications,recentResult]=await Promise.all([
        supabase.from("certificates").select("id",{count:"exact",head:true}),
        supabase.from("certificate_templates").select("id",{count:"exact",head:true}),
        supabase.from("certificate_verifications").select("id",{count:"exact",head:true}),
        supabase.from("certificates").select("id,certificate_id,status,created_at,template_name").order("created_at",{ascending:false}).limit(5),
      ]);
      if(!active)return;
      if(!certs.error)setCertificateCount(certs.count??0);
      if(!templates.error)setTemplateCount(templates.count??0);
      if(!verifications.error)setVerificationCount(verifications.count??0);
      if(!recentResult.error)setRecent(recentResult.data??[]);
      setLoading(false);
    }
    void load();
    return ()=>{active=false;};
  },[]);

  useEffect(() => {
    let active=true;
    async function checkFirstSetup(){
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return;
      const accountId=requireSelectedAccountId();
      const key="cv-letterhead-setup-skipped:"+accountId;
      if(window.localStorage.getItem(key))return;
      const [heads,member]=await Promise.all([
        supabase.from("cv_cover_letter_templates").select("id,is_default").eq("account_id",accountId).limit(50),
        supabase.from("account_members").select("role").eq("account_id",accountId).eq("user_id",user.id).eq("status","active").maybeSingle(),
      ]);
      if(!active || heads.error || member.error)return;
      if(!["owner","admin"].includes(member.data?.role??""))return;
      if(!(heads.data??[]).some(item=>item.is_default)){
        setSetupAccountId(accountId);
        setShowLetterheadSetup(true);
      }
    }
    void checkFirstSetup().catch(()=>{ /* Optional onboarding must not block normal work. */ });
    return()=>{active=false;};
  },[]);


  return <main className="cv-page">
    <div className="cv-shell space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-teal-800">VALUERSEAL WORKSPACE</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Welcome to ValuerSeal</h1>
          <p className="mt-2 text-base text-slate-600">Your valuation reports, QR verification and payment records in one place.</p>
        </div>
        <ProfileAvatarLink/>
      </header>

      {showLetterheadSetup && <section aria-label="One-time letterhead setup" className="rounded-2xl border border-teal-200 bg-teal-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-teal-950">Set up your letterhead once</h2>
            <p className="mt-1 text-base text-teal-900">Upload your letterhead and choose where the QR will appear. This step is optional.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/dashboard/cover-letters" className="cv-primary">Upload letterhead</Link>
            <button type="button" className="cv-secondary"
              onClick={()=>{window.localStorage.setItem("cv-letterhead-setup-skipped:"+setupAccountId,"1");setShowLetterheadSetup(false);}}>
              Not now
            </button>
          </div>
        </div>
      </section>}

      <section aria-label="Main actions">
        <h2 className="text-2xl font-extrabold text-slate-900">What would you like to do?</h2>
        <p className="mt-1 text-base text-slate-600">Choose one task to get started.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Link href="/dashboard/certificates" className="cv-card cv-card--interactive group flex min-h-48 flex-col justify-between p-6">
            <span className="cv-glow-icon"><Graphic name="certificate"/></span>
            <span className="mt-5 block text-xl font-extrabold text-slate-900">+ Create Certificate</span>
            <span className="mt-1 block text-base text-slate-600">Record a new valuation and get its QR.</span>
            <span className="mt-4 block text-sm font-bold text-teal-800">Start valuation →</span>
          </Link>
          <Link href="/dashboard/certificates/list" className="cv-card cv-card--interactive group flex min-h-48 flex-col justify-between p-6">
            <span className="cv-glow-icon"><Graphic name="scan"/></span>
            <span className="mt-5 block text-xl font-extrabold text-slate-900">Find a Valuation</span>
            <span className="mt-1 block text-base text-slate-600">Search a property, client or certificate.</span>
            <span className="mt-4 block text-sm font-bold text-teal-800">Open valuation register →</span>
          </Link>
          {canManageFees ?
            <Link href="/dashboard/valuation-payments" className="cv-card cv-card--interactive group flex min-h-48 flex-col justify-between p-6">
              <span className="cv-glow-icon"><Graphic name="excel"/></span>
              <span className="mt-5 block text-xl font-extrabold text-slate-900">Job Payments</span>
              <span className="mt-1 block text-base text-slate-600">See unpaid valuation fees by bank and client.</span>
              <span className="mt-4 block text-sm font-bold text-teal-800">View payments →</span>
            </Link> :
            <Link href="/dashboard/reference-map" className="cv-card cv-card--interactive group flex min-h-48 flex-col justify-between p-6">
              <span className="cv-glow-icon"><Graphic name="template"/></span>
              <span className="mt-5 block text-xl font-extrabold text-slate-900">Past Valuations</span>
              <span className="mt-1 block text-base text-slate-600">Find your property reference locations.</span>
              <span className="mt-4 block text-sm font-bold text-teal-800">Open map →</span>
            </Link>}
        </div>
      </section>

      <section aria-label="More tools">
        <h2 className="text-xl font-extrabold text-slate-900">Other useful tools</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {href:"/dashboard/certificates/bulk",label:"Import Excel",help:"Create records in bulk"},
            {href:"/dashboard/cover-letters",label:"Letterhead Setup",help:"Place the verification QR"},
            {href:"/dashboard/report-formats",label:"Report Formats",help:"Use your preferred bank format"},
            {href:"/dashboard/reference-map",label:"Reference Map",help:"See previous properties"},
          ].map(action=><Link key={action.href} href={action.href} className="cv-panel cv-card--interactive block p-5">
            <span className="block text-base font-bold text-slate-900">{action.label} →</span>
            <span className="mt-2 block text-sm text-slate-600">{action.help}</span>
          </Link>)}
        </div>
      </section>

      <section className="cv-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-5">
          <h2 className="text-xl font-extrabold text-slate-900">Recent valuations</h2>
          <Link className="text-sm font-bold text-teal-800 underline-offset-4 hover:underline" href="/dashboard/certificates/list">View all certificates →</Link>
        </div>
        {loading ? <p className="p-6 text-base text-slate-500">Loading your recent work…</p>:
          recent.length===0 ? <p className="p-6 text-base text-slate-600">No valuations yet. Use Create Certificate above to begin.</p>:
          <div className="divide-y divide-slate-100">
            {recent.map(c=><Link href={"/dashboard/certificates/"+c.id} key={c.id}
              className="flex min-h-18 items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900">{c.template_name||"Property valuation"}</p>
                <p className="mt-1 max-w-lg truncate text-sm text-slate-500">{c.certificate_id}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-teal-800">Open →</span>
            </Link>)}
          </div>}
      </section>
      <details className="rounded-2xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-base font-bold text-slate-800">Your activity numbers (optional)</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <Metric label="Certificates issued" count={certificateCount} kind="certificate" color="text-[#008d7e]" help="Issued records"/>
          <Metric label="Saved templates" count={templateCount} kind="template" color="text-[#3557b5]" help="Valuation forms"/>
          <Metric label="QR scans" count={verificationCount} kind="scan" color="text-[#9467ba]" help="Verification activity"/>
        </div>
      </details>
    </div>
  </main>;
}
