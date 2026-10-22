"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { accountHeaders } from "@/lib/accounts/context";
import { getCertificateTemplates, type CertificateTemplate } from "@/lib/repositories/templates";
import { getCertificateFields, type CertificateField } from "@/lib/repositories/certificate-fields";
import { normalizeBulkDate, displayBulkDate } from "@/lib/bulk/date";

type Sheet={headers:string[];rows:string[][]};
type Item={id:string;certificateId:string;publicReference:string;sourceRow:number;status:string};
type Batch={id:string;name:string;sourceName:string;rowCount:number;createdAt:string;items:Item[]};
type Summary={id:string;name:string;sourceName:string;rowCount:number;createdAt:string};

function validate(fields:CertificateField[],mapping:Record<string,number>,rows:string[][]){
  const errors:string[]=[];
  if(!rows.length)errors.push("Select at least one certificate row.");
  if(rows.length>100)errors.push("Maximum 100 certificates per upload.");
  const cols=fields.map(f=>mapping[f.id]);
  if(cols.some(x=>x===undefined||x<0))errors.push("Map every template field to an Excel column.");
  if(new Set(cols).size!==cols.length)errors.push("Each Excel column can be mapped to only one field.");
  rows.forEach((row,index)=>fields.forEach(field=>{
    const val=row[mapping[field.id]]??"";
    if(field.is_required&&!val.trim())errors.push("Row "+(index+2)+": "+field.field_name+" is required.");
    if(val.length>1500)errors.push("Row "+(index+2)+": "+field.field_name+" is too long.");
    if(val.trim()&&field.field_type==="number"&&!/^-?\d+(\.\d+)?$/.test(val.trim()))
      errors.push("Row "+(index+2)+": "+field.field_name+" must be numeric.");
    if(val.trim()&&field.field_type==="date"&&!normalizeBulkDate(val))
      errors.push("Row "+(index+2)+": "+field.field_name+" needs a valid DD/MM/YYYY date (Excel date cells also work).");
  }));
  return errors;
}
async function authorizedFetch(path:string,init:RequestInit={}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error("Log in again to continue.");
  const headers=accountHeaders(init.headers);
  headers.set("Authorization","Bearer "+session.access_token);
  const res=await fetch(path,{...init,headers,cache:"no-store"});
  if(!res.ok){
    let message="The Excel operation failed.";
    try{message=(await res.json()).error||message;}catch{}
    throw new Error(message);
  }
  return res;
}
function saveBlob(blob:Blob,filename:string){
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download=filename;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function BulkCertificatePage(){
  const [templates,setTemplates]=useState<CertificateTemplate[]>([]);
  const [selected,setSelected]=useState("");
  const [fields,setFields]=useState<CertificateField[]>([]);
  const [fileName,setFileName]=useState("");
  const [batchName,setBatchName]=useState("");
  const [sheet,setSheet]=useState<Sheet|null>(null);
  const [mapping,setMapping]=useState<Record<string,number>>({});
  const [batches,setBatches]=useState<Summary[]>([]);
  const [result,setResult]=useState<Batch|null>(null);
  const [remaining,setRemaining]=useState<number|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const lock=useRef(false);
  const key=useRef<string|null>(null);

  useEffect(()=>{
    void getCertificateTemplates().then(result=>{
      setTemplates(result);
      const requested = new URLSearchParams(window.location.search).get("template");
      if(requested && result.some(t=>t.id===requested))setSelected(requested);
    }).catch(e=>setError(String(e)));
    void supabase.rpc("cv_subscription_status").then(({data,error:failure})=>{
      if(!failure){
        const period=(data as {period?:{remaining_certificates?:number|null}}|null)?.period;
        if(typeof period?.remaining_certificates==="number")setRemaining(period.remaining_certificates);
      }
    });
    void supabase.rpc("cv_bulk_batches_list").then(({data,error:failure})=>{
      if(!failure&&Array.isArray(data))setBatches(data as Summary[]);
    });
  },[]);
  useEffect(()=>{
    if(!selected)return;
    let active=true;
    void getCertificateFields(selected).then(result=>{if(active)setFields(result);})
      .catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;};
  },[selected]);
  const errors=useMemo(()=>{
    const found=sheet?validate(fields,mapping,sheet.rows):[];
    if(sheet&&remaining!==null&&sheet.rows.length>remaining)found.push("The organization has only "+remaining+" certificate quota units remaining. Remove rows or ask the owner to renew.");
    return found;
  },[fields,mapping,sheet,remaining]);
  async function downloadTemplate(){
    try{
      setError("");
      const response=await authorizedFetch("/api/bulk/template?template="+encodeURIComponent(selected));
      saveBlob(await response.blob(),"certverify-template.xlsx");
    }catch(e){setError(e instanceof Error?e.message:"Could not download Excel template.");}
  }
  async function upload(file:File|null){
    if(!file)return;
    setError("");setResult(null);setSheet(null);setFileName("");key.current=null;
    if(!selected){setError("Select a certificate template first.");return;}
    if(file.size>1024*1024||!file.name.toLowerCase().endsWith(".xlsx")){
      setError("Choose a genuine .xlsx workbook smaller than 1 MB.");return;
    }
    setBusy(true);
    try{
      const form=new FormData();form.append("file",file);
      const res=await authorizedFetch("/api/bulk/preview",{method:"POST",body:form});
      const parsed=await res.json() as Sheet;
      const inferred:Record<string,number>={};
      fields.forEach(f=>{
        inferred[f.id]=parsed.headers.findIndex(h=>h.trim().toLowerCase()===f.field_name.trim().toLowerCase());
      });
      setMapping(inferred);setSheet(parsed);setFileName(file.name);
      setBatchName(file.name.replace(/\.xlsx$/i,"").slice(0,120));
      key.current=crypto.randomUUID();
    }catch(e){setError(e instanceof Error?e.message:"Could not read the Excel file.");}
    finally{setBusy(false);}
  }
  function edit(rowIndex:number,colIndex:number,value:string){
    if(lock.current)return;
    setSheet(previous=>previous?{...previous,rows:previous.rows.map((row,i)=>
      i===rowIndex?row.map((cell,k)=>k===colIndex?value:cell):row)}:previous);
    key.current=crypto.randomUUID();
  }
  function removeRow(rowIndex:number){
    setSheet(previous=>previous?{...previous,rows:previous.rows.filter((_,i)=>i!==rowIndex)}:previous);
    key.current=crypto.randomUUID();
  }
  async function confirm(){
    if(lock.current||!sheet||!selected||errors.length||sheet.rows.length===0)return;
    lock.current=true;setBusy(true);setError("");
    if(!key.current)key.current=crypto.randomUUID();
    const currentKey=key.current;
    try{
      const rows=sheet.rows.map(row=>Object.fromEntries(fields.map(f=>{
        const raw=(row[mapping[f.id]]??"").trim();
        return [f.id,f.field_type==="date"&&raw?normalizeBulkDate(raw):raw];
      })));
      const {data,error:failure}=await supabase.rpc("cv_create_certificate_batch",{
        p_template:selected,p_rows:rows,p_idempotency:currentKey,
        p_filename:fileName,p_label:batchName,
      });
      if(failure)throw new Error(failure.message);
      const batch=data as Batch;setResult(batch);setSheet(null);
      setBatches(prev=>[{
        id:batch.id,name:batch.name,sourceName:batch.sourceName,
        rowCount:batch.rowCount,createdAt:batch.createdAt,
      },...prev.filter(b=>b.id!==batch.id)]);
    }catch(e){setError((e instanceof Error?e.message:"Could not generate certificates.")+
      " If the network interrupted after confirmation, check Bulk Imports before retrying. The same confirmation key is safe to retry.");}
    finally{setBusy(false);lock.current=false;}
  }
  async function downloadZip(batchId:string,format:"jpeg"|"png"){
    setBusy(true);setError("");
    try{
      const response=await authorizedFetch("/api/bulk/download",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({batchId,format}),
      });
      saveBlob(await response.blob(),"certverify-bulk-qrs-"+format+".zip");
    }catch(e){setError(e instanceof Error?e.message:"Could not download QR codes.");}
    finally{setBusy(false);}
  }
  return <main className="cv-page">
    <div className="cv-shell space-y-7 cv-entrance">
    <header className="cv-hero">
      <div className="cv-hero__body flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
        <div className="max-w-[690px]">
          <Link href="/dashboard/certificates" className="inline-flex items-center gap-2 text-sm font-semibold text-[#9ce4d6] hover:text-white">← Create certificate manually</Link>
          <p className="cv-eyebrow mt-6">CERTIFICATE AUTOMATION</p>
          <h1 className="mt-2 text-white">Bulk certificate generation</h1>
          <p className="mt-4 max-w-xl text-sm sm:text-base">Upload Excel, map fields and review every record. Issue up to <strong className="text-white">100 unique certificates</strong> only after you confirm.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-[#b2f6e9]">✓ One QR per certificate</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-[#b2f6e9]">✓ No certificates before approval</span>
          </div>
        </div>
        <div aria-hidden="true" className="hidden w-[180px] shrink-0 rounded-2xl border border-white/20 bg-white/10 p-4 shadow-xl backdrop-blur-sm lg:block">
          <div className="rounded-xl bg-white px-3 py-3 shadow-lg">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#dff7ed] text-[#0c8878]">▦</span>
              <div className="flex-1"><div className="h-1.5 w-16 rounded-full bg-slate-300"/><div className="mt-1 h-1 w-11 rounded-full bg-slate-200"/></div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1">
              {Array.from({length:18},(_,i)=><span key={i} className={"h-3 rounded-[3px] "+(i<3?"bg-[#b9eadd]":i%3===0?"bg-[#d7e8f2]":"bg-slate-100")}/>)}
            </div>
            <div className="mt-3 rounded-lg bg-[#e6faf1] px-2 py-1.5 text-center text-xs font-extrabold text-[#0b8469]">100 rows · Ready</div>
          </div>
        </div>
      </div>
    </header>
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Bulk import progress">
      {[
        {number:"01",title:"Upload",subtitle:"Select template & Excel",active:!sheet&&!result},
        {number:"02",title:"Review",subtitle:"Map, correct & validate",active:Boolean(sheet)&&!result},
        {number:"03",title:"Generate",subtitle:"Confirm & download QRs",active:Boolean(result)},
      ].map(step=><div key={step.number} className={"cv-card flex items-center gap-3 px-4 py-4 "+(step.active?"!border-[#8fd2ca] !bg-[#effaf7] ring-1 ring-[#b3e8db]":"")}>
        <span className={"cv-step "+(step.active?"!bg-[#129f91] !text-white":"")}>{step.number}</span>
        <div><p className="text-sm font-extrabold text-[#1c3049]">{step.title}</p><p className="mt-1 text-xs text-[#72839b]">{step.subtitle}</p></div>
      </div>)}
    </div>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">⚠ {error}</p>}
    {result&&<section className="cv-panel space-y-4 !border-[#a9d9ca] !bg-[#f0fbf6] p-6">
      <h2 className="text-xl font-bold">Batch confirmed — {result.items.length} certificates created</h2>
      <p>Each certificate has its own ID and public QR link. All are grouped under {result.name}.</p>
      <div className="flex flex-wrap gap-3">
        <Link className="rounded bg-blue-700 px-4 py-2 font-semibold text-white" href={"/dashboard/certificates/bulk/"+result.id}>View certificates</Link>
        <button disabled={busy} onClick={()=>void downloadZip(result.id,"jpeg")} className="rounded bg-slate-900 px-4 py-2 font-semibold text-white">Download QR ZIP (JPEG)</button>
        <button disabled={busy} onClick={()=>void downloadZip(result.id,"png")} className="rounded border bg-white px-4 py-2 font-semibold">PNG ZIP</button>
      </div>
    </section>}
    {!result&&<section className="cv-panel space-y-6 p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="cv-step">01</span><div><h2 className="cv-section-title">Select template and upload Excel</h2><p className="cv-section-description">Start with a saved layout or build a new certificate template.</p></div>
      </div>
      <label className="block max-w-xl space-y-1">
        <span className="text-sm font-bold text-[#273c55]">Certificate template</span>
        <select className="cv-field" value={selected} onChange={e=>{
            if(e.target.value==="__create__"){
              window.location.assign("/dashboard/templates?create=1&from=bulk");
              return;
            }
            setSelected(e.target.value);setFields([]);setSheet(null);setResult(null);setMapping({});setFileName("");setBatchName("");key.current=null;
          }} disabled={busy}>
          <option value="">Select existing template</option>
          {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="__create__">＋ Create a new template…</option>
        </select>
        <Link href="/dashboard/templates?create=1&from=bulk" className="mt-2 inline-flex text-sm font-semibold text-teal-700 hover:text-teal-900 hover:underline">+ Create and configure a new template →</Link>
      </label>
      {selected&&<div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!fields.length||busy} onClick={()=>void downloadTemplate()} className="cv-secondary text-sm disabled:opacity-50">Download Excel template</button>
        <span className="text-sm text-slate-500">Or upload your own .xlsx and map the columns. Dates: DD/MM/YYYY (text or Excel date cells); formulas are not supported.</span>
      </div>}
      <label className="cv-dropzone block max-w-2xl space-y-3">
        <span className="cv-glow-icon !h-12 !w-12" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V3m0 0L7 8m5-5 5 5M4 16v4h16v-4"/></svg></span>
        <span className="block text-base font-extrabold text-[#1e384a]">Upload your Excel workbook</span>
        <span className="block text-xs text-[#718399]">Excel .xlsx · 1 MB maximum · 100 certificates per batch</span>
        <input aria-label="Excel file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy||!fields.length} onChange={e=>void upload(e.target.files?.[0]||null)}
          className="block w-full rounded-xl border border-[#d3e5e2] bg-white p-3 text-sm"/>
      </label>
    </section>}
    {sheet&&!result&&<section className="cv-panel space-y-5 p-5 sm:p-8">
      <div className="flex items-center gap-3"><span className="cv-step">02</span><div><h2 className="cv-section-title">Match columns and edit the preview</h2><p className="cv-section-description">Review before issuing; every correction updates the final data.</p></div></div>
      <p className="text-sm text-slate-600">{sheet.rows.length} filled rows found. Certificate IDs and QR codes are not generated yet.{remaining!==null?" Available organization quota: "+remaining+" certificates.":""}</p>
      <label className="block max-w-xl space-y-1"><span className="font-semibold">Batch name</span>
        <input value={batchName} onChange={e=>setBatchName(e.target.value.slice(0,120))}
          className="cv-field" placeholder="e.g., October valuation reports"/>
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map(f=><label className="block space-y-1 text-sm" key={f.id}>
          <span className="font-semibold">{f.field_name} {f.is_required?"*":""}</span>
          <select aria-label={"Column for "+f.field_name} className="cv-field"
            value={mapping[f.id]??-1} onChange={e=>{setMapping(old=>({...old,[f.id]:Number(e.target.value)}));key.current=crypto.randomUUID();}}>
            <option value={-1}>Select Excel column</option>
            {sheet.headers.map((name,i)=><option key={i} value={i}>{name}</option>)}
          </select>
        </label>)}
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#e6ebf2]">
        <table className="cv-table min-w-full">
          <thead className="bg-[#f2f7f9]"><tr>
            <th className="sticky left-0 border bg-slate-100 px-2 py-3 text-left">Row</th>
            {fields.map(f=><th key={f.id} className="min-w-44 border px-2 py-3 text-left">{f.field_name}</th>)}
            <th className="border px-2 py-3">Action</th>
          </tr></thead>
          <tbody>{sheet.rows.map((row,i)=><tr key={i}>
            <td className="sticky left-0 border bg-white px-2">{i+2}</td>
            {fields.map(f=><td key={f.id} className="border p-1">
              <input aria-label={"Row "+(i+2)+" "+f.field_name}
                className="cv-field !rounded-lg !px-2.5 !py-2 !text-sm" value={f.field_type==="date"?displayBulkDate(row[mapping[f.id]]??""):(row[mapping[f.id]]??"")}
                disabled={mapping[f.id]===-1||mapping[f.id]===undefined}
                onChange={e=>edit(i,mapping[f.id],e.target.value)}/>
            </td>)}
            <td className="border p-1"><button type="button" onClick={()=>removeRow(i)}
              className="rounded px-3 py-2 font-semibold text-red-600 hover:bg-red-50">Remove</button></td>
          </tr>)}</tbody>
        </table>
      </div>
      {errors.length>0&&<div role="alert" className="rounded border border-amber-200 bg-amber-50 p-4 text-amber-950">
        <p className="font-semibold">{errors.length} issue(s) must be corrected before confirmation:</p>
        <ul className="mt-2 list-inside list-disc text-sm">{errors.slice(0,15).map((e,i)=><li key={i}>{e}</li>)}</ul>
        {errors.length>15&&<p className="text-xs">More issues remain in the preview.</p>}
      </div>}
      <div className="flex flex-wrap items-center gap-4 border-t pt-5">
        <button disabled={busy||errors.length>0||!sheet.rows.length||!batchName.trim()}
          onClick={()=>void confirm()} className="cv-primary disabled:cursor-not-allowed disabled:opacity-40">
          {busy?"Creating batch…":"Confirm & generate "+sheet.rows.length+" certificates"}
        </button>
        <p className="text-sm text-slate-600">Final confirmation uses {sheet.rows.length} organization certificate quota units.</p>
      </div>
    </section>}
    <section className="space-y-4">
      <div className="flex items-center gap-3"><span className="cv-step">↗</span><div><h2 className="cv-section-title">Previous bulk imports</h2><p className="cv-section-description">Open a batch anytime to view each certificate and download QR codes.</p></div></div>
      {!batches.length?<p className="text-slate-600">No bulk imports yet.</p>:<div className="cv-panel overflow-x-auto">
        <table className="cv-table">
          <thead className="bg-slate-50"><tr><th className="p-3">Batch</th><th className="p-3">Certificates</th><th className="p-3">Created</th><th className="p-3">Details</th></tr></thead>
          <tbody>{batches.map(b=><tr key={b.id} className="border-t">
            <td className="p-3">{b.name}<p className="text-xs text-slate-500">{b.sourceName}</p></td>
            <td className="p-3">{b.rowCount}</td>
            <td className="p-3">{new Date(b.createdAt).toLocaleDateString("en-IN")}</td>
            <td className="p-3"><Link href={"/dashboard/certificates/bulk/"+b.id} className="font-semibold text-blue-700">View certificates</Link></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    </div>
  </main>;
}
