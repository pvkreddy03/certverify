"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type RecentCertificate={id:string;certificate_id:string;status:string;created_at:string};
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
  const [email,setEmail]=useState("");
  const [certificateCount,setCertificateCount]=useState<number|null>(null);
  const [templateCount,setTemplateCount]=useState<number|null>(null);
  const [verificationCount,setVerificationCount]=useState<number|null>(null);
  const [recent,setRecent]=useState<RecentCertificate[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let active=true;
    async function load(){
      const {data:{user}}=await supabase.auth.getUser();
      if(!user||!active){if(active)setLoading(false);return;}
      setEmail(user.email||"");
      const [certs,templates,verifications,recentResult]=await Promise.all([
        supabase.from("certificates").select("id",{count:"exact",head:true}),
        supabase.from("certificate_templates").select("id",{count:"exact",head:true}),
        supabase.from("certificate_verifications").select("id",{count:"exact",head:true}),
        supabase.from("certificates").select("id,certificate_id,status,created_at").order("created_at",{ascending:false}).limit(5),
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

  async function handleLogout(){
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return <main className="cv-page">
    <div className="cv-shell space-y-8 cv-entrance">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="cv-eyebrow"><span className="h-2 w-2 rounded-full bg-[#0d978f]"/> Your workspace</p>
          <h1 className="mt-2 text-[28px] font-extrabold tracking-tight text-[#172a45] sm:text-4xl">Welcome to CertVerify</h1>
          <p className="mt-2 text-sm text-[#687991]">Certificates, reusable Word report formats, location-tagged references and verification—organized in one place.</p>
        </div>
        <div className="flex items-center gap-3">
          {email&&<span className="hidden max-w-[220px] truncate rounded-full border border-[#e4edf1] bg-white px-4 py-2 text-xs font-medium text-[#6d7b92] md:inline">{email}</span>}
          <button type="button" onClick={handleLogout} className="cv-secondary !px-4 !py-2.5 text-sm">Sign out</button>
        </div>
      </div>

      <section className="cv-hero">
        <div className="cv-hero__body relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold tracking-wide text-[#a6f8e5]">
              <Graphic name="shield" className="h-4 w-4"/> Secure document authentication
            </span>
            <h2 className="mt-5 max-w-[690px] text-white">One trusted record.<br/><span className="text-[#79ead7]">Every certificate.</span></h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 sm:text-base">Create verifiable certificates and unique QR codes, generate Word reports using bank- or client-specific formats, and keep geotagged property valuations on your private reference map—all from one professional workspace.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-white/90">
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">✓ QR verification</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">✓ Multiple Word formats</span>
              <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5">✓ Property location references</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/dashboard/certificates" className="cv-primary !border-[#4ce0cb] !bg-[#43d2bc] !text-[#072b32] hover:!bg-[#76ead7]">
                <Graphic name="certificate" className="h-5 w-5"/> + Create Certificate
              </Link>
              <Link href="/dashboard/report-formats" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/20">
                <Graphic name="template" className="h-5 w-5"/> Word report formats <Graphic name="arrow" className="h-4 w-4"/>
              </Link>
              <Link href="/dashboard/certificates/bulk" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/20">
                <Graphic name="excel" className="h-5 w-5"/> Bulk Excel import <Graphic name="arrow" className="h-4 w-4"/>
              </Link>
            </div>
          </div>
          <div aria-hidden="true" className="relative mx-auto hidden h-[215px] w-[215px] items-center justify-center rounded-[28px] border border-white/20 bg-white/[.10] shadow-[0_25px_45px_rgba(0,0,0,.15)] backdrop-blur-sm lg:flex">
            <div className="relative h-[145px] w-[145px] rounded-2xl bg-white p-4 shadow-lg">
              <svg className="h-full w-full text-[#102f42]" viewBox="0 0 100 100" fill="currentColor">
                <path d="M0 0h31v31H0zm7 7v17h17V7zm62-7h31v31H69zm7 7v17h17V7zM0 69h31v31H0zm7 7v17h17V76z" fillRule="evenodd"/>
                <path d="M11 11h9v9h-9zM80 11h9v9h-9zM11 80h9v9h-9zM41 0h9v10h-9zM53 0h10v20H53zM38 18h18v9H38zM38 38h10v10H38zM51 33h11v12H51zM69 41h10v8H69zM83 39h17v9H83zM0 41h10v18H0zM16 39h16v10H16zM40 53h8v14h-8zM55 55h13v8H55zM75 57h9v18h-9zM89 54h11v11H89zM38 74h11v12H38zM55 72h12v11H55zM69 86h10v14H69zM85 83h15v17H85zM0 56h25v8H0z"/>
              </svg>
            </div>
            <div className="absolute -right-5 bottom-4 rounded-xl border border-[#9decd8] bg-[#daf9ee] px-3 py-2 text-xs font-extrabold text-[#086e65] shadow-md">✓ Verified</div>
          </div>
        </div>
      </section>

      <section aria-label="Certificate statistics" className="grid gap-4 md:grid-cols-3">
        <Metric label="Certificates issued" count={certificateCount} kind="certificate" color="text-[#008d7e]" help="Unique, individually verifiable records"/>
        <Metric label="Saved templates" count={templateCount} kind="template" color="text-[#3557b5]" help="Reusable certificate field layouts"/>
        <Metric label="Verification scans" count={verificationCount} kind="scan" color="text-[#9467ba]" help="Public certificate verification activity"/>
      </section>

      <div className="grid gap-7 lg:grid-cols-[1.15fr_.85fr]">
        <section className="cv-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1f5] px-6 py-5">
            <div><h3 className="cv-section-title">Recent certificates</h3><p className="cv-section-description mt-1">The latest records available to your account.</p></div>
            <Link className="text-sm font-bold text-[#087c73] hover:underline" href="/dashboard/certificates/list">View all →</Link>
          </div>
          {loading?<p className="p-7 text-sm text-slate-500">Loading certificate activity…</p>:recent.length===0?
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <span className="cv-glow-icon"><Graphic name="certificate"/></span>
              <p className="font-bold">No certificates to display yet</p>
              <p className="text-sm text-slate-500">Create one or import an Excel spreadsheet to begin.</p>
            </div>:
            <div className="divide-y divide-[#eef1f5]">
              {recent.map(c=><Link key={c.id} href={"/dashboard/certificates/"+c.id}
                className="group flex items-center gap-4 px-6 py-4 hover:bg-[#f7fcfb]">
                <span className="cv-glow-icon !h-10 !w-10 !rounded-xl"><Graphic name="certificate" className="h-5 w-5"/></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[#213650]">{c.certificate_id}</span>
                  <span className="block text-xs text-slate-500">{new Date(c.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}</span>
                </span>
                <span className={"rounded-full px-2.5 py-1 text-xs font-bold "+(c.status.toLowerCase()==="active"?"bg-[#e1f7ed] text-[#0a8466]":c.status.toLowerCase()==="revoked"?"bg-red-50 text-red-700":"bg-slate-100 text-slate-600")}>{c.status}</span>
                <Graphic name="arrow" className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1"/>
              </Link>)}
            </div>
          }
        </section>

        <section className="space-y-4">
          <div><h3 className="cv-section-title">Quick actions</h3><p className="cv-section-description mt-1">Move from creation to verification in fewer steps.</p></div>
          {[
            {href:"/dashboard/certificates/bulk",name:"Generate from Excel",help:"Preview, edit and issue up to 100 certificates",kind:"excel" as IconName},
            {href:"/dashboard/templates",name:"Manage templates",help:"Design reusable fields and approval-ready formats",kind:"template" as IconName},
            {href:"/dashboard/certificates/list",name:"Certificate library",help:"Find certificates and download their QR codes",kind:"certificate" as IconName},
          ].map(action=><Link href={action.href} key={action.href}
            className="cv-card cv-card--interactive group flex items-center gap-4 p-5">
            <span className="cv-glow-icon"><Graphic name={action.kind}/></span>
            <span className="flex-1"><span className="block font-bold text-[#20324b]">{action.name}</span><span className="mt-1 block text-xs leading-5 text-[#748298]">{action.help}</span></span>
            <Graphic name="arrow" className="h-4 w-4 text-[#6e94a3] transition-transform group-hover:translate-x-1"/>
          </Link>)}
        </section>
      </div>
    </div>
  </main>;
}
