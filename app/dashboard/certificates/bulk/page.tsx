"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { accountHeaders } from "@/lib/accounts/context";
import { getCertificateTemplates, type CertificateTemplate } from "@/lib/repositories/templates";
import { getCertificateFields, type CertificateField } from "@/lib/repositories/certificate-fields";

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
    if(val.trim()&&field.field_type==="date"){
      if(!/^\d{4}-\d\d-\d\d$/.test(val.trim())||Number.isNaN(Date.parse(val.trim()))||
         new Date(val.trim()).toISOString().slice(0,10)!==val.trim())
        errors.push("Row "+(index+2)+": "+field.field_name+" needs YYYY-MM-DD (as text in Excel).");
    }
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
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const lock=useRef(false);
  const key=useRef<string|null>(null);

  useEffect(()=>{
    void getCertificateTemplates().then(setTemplates).catch(e=>setError(String(e)));
    void supabase.rpc("cv_bulk_batches_list").then(({data,error:failure})=>{
      if(!failure&&Array.isArray(data))setBatches(data as Summary[]);
    });
  },[]);
  useEffect(()=>{
    setSheet(null);setResult(null);setMapping({});setFileName("");setBatchName("");key.current=null;
    if(!selected){setFields([]);return;}
    void getCertificateFields(selected).then(setFields).catch(e=>setError(String(e)));
  },[selected]);
  const errors=useMemo(()=>sheet?validate(fields,mapping,sheet.rows):[],[fields,mapping,sheet]);
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
      const rows=sheet.rows.map(row=>Object.fromEntries(fields.map(f=>[f.id,(row[mapping[f.id]]??"").trim()])));
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
  return <main className="mx-auto max-w-7xl space-y-7 px-4 py-8 text-slate-900">
    <header className="space-y-2">
      <Link href="/dashboard/certificates" className="text-sm font-semibold text-blue-700">← Create certificate manually</Link>
      <h1 className="text-3xl font-bold">Bulk certificate generation</h1>
      <p className="text-slate-600">Upload an Excel file with up to 100 certificates. Review and edit everything before generating IDs or using your organization's quota.</p>
    </header>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
    {result&&<section className="space-y-4 rounded-xl border border-green-300 bg-green-50 p-6">
      <h2 className="text-xl font-bold">Batch confirmed — {result.items.length} certificates created</h2>
      <p>Each certificate has its own ID and public QR link. All are grouped under {result.name}.</p>
      <div className="flex flex-wrap gap-3">
        <Link className="rounded bg-blue-700 px-4 py-2 font-semibold text-white" href={"/dashboard/certificates/bulk/"+result.id}>View certificates</Link>
        <button disabled={busy} onClick={()=>void downloadZip(result.id,"jpeg")} className="rounded bg-slate-900 px-4 py-2 font-semibold text-white">Download QR ZIP (JPEG)</button>
        <button disabled={busy} onClick={()=>void downloadZip(result.id,"png")} className="rounded border bg-white px-4 py-2 font-semibold">PNG ZIP</button>
      </div>
    </section>}
    {!result&&<section className="space-y-5 rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">1. Select template and upload Excel</h2>
      <label className="block max-w-xl space-y-1">
        <span className="font-semibold">Certificate template</span>
        <select className="w-full rounded border px-3 py-2" value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}>
          <option value="">Select existing template</option>
          {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      {selected&&<div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!fields.length||busy} onClick={()=>void downloadTemplate()} className="rounded border border-blue-200 bg-blue-50 px-4 py-2 font-semibold text-blue-700 disabled:opacity-50">Download Excel template</button>
        <span className="text-sm text-slate-500">Or upload your own .xlsx and map the columns. Dates should be YYYY-MM-DD text, without formulas.</span>
      </div>}
      <label className="block max-w-xl space-y-1">
        <span className="font-semibold">Excel file (.xlsx, maximum 1 MB)</span>
        <input aria-label="Excel file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={busy||!fields.length} onChange={e=>void upload(e.target.files?.[0]||null)}
          className="block w-full rounded border p-3 text-sm"/>
      </label>
    </section>}
    {sheet&&!result&&<section className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">2. Match columns and edit the preview</h2>
      <p className="text-sm text-slate-600">{sheet.rows.length} filled rows found. Certificate IDs and QR codes are not generated yet.</p>
      <label className="block max-w-xl space-y-1"><span className="font-semibold">Batch name</span>
        <input value={batchName} onChange={e=>setBatchName(e.target.value.slice(0,120))}
          className="w-full rounded border p-2" placeholder="e.g., October valuation reports"/>
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        {fields.map(f=><label className="block space-y-1 text-sm" key={f.id}>
          <span className="font-semibold">{f.field_name} {f.is_required?"*":""}</span>
          <select aria-label={"Column for "+f.field_name} className="w-full rounded border p-2"
            value={mapping[f.id]??-1} onChange={e=>{setMapping(old=>({...old,[f.id]:Number(e.target.value)}));key.current=crypto.randomUUID();}}>
            <option value={-1}>Select Excel column</option>
            {sheet.headers.map((name,i)=><option key={i} value={i}>{name}</option>)}
          </select>
        </label>)}
      </div>
      <div className="overflow-x-auto rounded border">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-slate-100"><tr>
            <th className="sticky left-0 border bg-slate-100 px-2 py-3 text-left">Row</th>
            {fields.map(f=><th key={f.id} className="min-w-44 border px-2 py-3 text-left">{f.field_name}</th>)}
            <th className="border px-2 py-3">Action</th>
          </tr></thead>
          <tbody>{sheet.rows.map((row,i)=><tr key={i}>
            <td className="sticky left-0 border bg-white px-2">{i+2}</td>
            {fields.map(f=><td key={f.id} className="border p-1">
              <input aria-label={"Row "+(i+2)+" "+f.field_name}
                className="w-full rounded border border-slate-200 p-2" value={row[mapping[f.id]]??""}
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
          onClick={()=>void confirm()} className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {busy?"Creating batch…":"Confirm & generate "+sheet.rows.length+" certificates"}
        </button>
        <p className="text-sm text-slate-600">Final confirmation uses {sheet.rows.length} organization certificate quota units.</p>
      </div>
    </section>}
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Previous bulk imports</h2>
      {!batches.length?<p className="text-slate-600">No bulk imports yet.</p>:<div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
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
  </main>;
}
