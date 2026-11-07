"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  snapshotField, suggestedDisplayFields, paymentLabel, formatRupees,
  type SavedField,
} from "@/lib/valuation/register";

export type RegisterCertificate={
  id:string;certificate_id:string;status:string;created_at:string;
  template_id:string|null; templateName:string;createdBy:string;
};
export type JobPayment={
  certificate_id:string; client_name:string;bank_name:string;branch_name:string;
  fee_amount:number|null;received_amount:number;due_date:string|null;notes?:string;
};
export type DisplayPreference={template_id:string;field_names:string[]};
export type TemplateFieldName={template_id:string;field_name:string};

export function ValuationRegister({
  certificates,fields,templateFields,preferences,payments,manager,
}:{
  certificates:RegisterCertificate[];
  fields:SavedField[];
  templateFields:TemplateFieldName[];
  preferences:DisplayPreference[];
  payments:JobPayment[];
  manager:boolean;
}){
  const [search,setSearch]=useState("");
  const [status,setStatus]=useState("all");
  const fieldMap=useMemo(()=>{
    const m=new Map<string,SavedField[]>();
    fields.forEach(field=>m.set(field.certificate_id,[...(m.get(field.certificate_id)||[]),field]));
    return m;
  },[fields]);
  const prefs=useMemo(()=>new Map(preferences.map(p=>[p.template_id,p.field_names])),[preferences]);
  const paymentsById=useMemo(()=>new Map(payments.map(p=>[p.certificate_id,p])),[payments]);
  const defaults=useMemo(()=>{
    const m=new Map<string,string[]>();
    for(const f of templateFields){
      const current=m.get(f.template_id)||[];
      if(!current.includes(f.field_name))m.set(f.template_id,[...current,f.field_name]);
    }
    for(const c of certificates){
      if(!c.template_id) continue;
      const current=m.get(c.template_id)||[];
      for(const v of fieldMap.get(c.id)||[]){
        if(!current.includes(v.field_name))current.push(v.field_name);
      }
      m.set(c.template_id,current);
    }
    for(const [templateId,labels] of m)m.set(templateId,suggestedDisplayFields(labels));
    return m;
  },[certificates,fieldMap,templateFields]);

  const shown=certificates.filter(c=>{
    const payment=manager?paymentsById.get(c.id):undefined;
    const statusText=paymentLabel(payment?.fee_amount,payment?.received_amount);
    if(status!=="all" && (status==="unpaid" ? !["Pending","Partially paid"].includes(statusText) : statusText!==status))return false;
    const names=c.template_id?(prefs.get(c.template_id)??defaults.get(c.template_id)??[]):[];
    const values=names.map(n=>snapshotField(fieldMap.get(c.id)||[],n)?.field_value||"").join(" ");
    const query=search.trim().toLocaleLowerCase("en-IN");
    return !query||[
      c.certificate_id,c.templateName,c.createdBy,values,
      payment?.client_name,payment?.bank_name,payment?.branch_name,
    ].filter(Boolean).join(" ").toLocaleLowerCase("en-IN").includes(query);
  });
  return <section aria-label="Valuation register" className="cv-panel overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
      <div>
        <h2 className="text-xl font-extrabold text-[#17354b]">Valuation register</h2>
        <p className="mt-1 text-sm text-slate-600">Find cases by actual saved fields, property details or certificate number. No field is relabelled by guesswork.</p>
      </div>
      {manager && <Link href="/dashboard/certificates/display" className="rounded-lg border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-bold text-teal-900 hover:bg-teal-100">Customize fields &amp; order</Link>}
    </div>
    <div className="flex flex-wrap gap-3 border-b p-4">
      <label className="min-w-48 flex-1 text-sm text-slate-700">Search valuations
        <input type="search" className="cv-field mt-1" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Owner, client, location, survey number, bank or certificate number"/>
      </label>
      {manager && <label className="text-sm text-slate-700">Job payment
        <select className="cv-field mt-1" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="all">All payments</option>
          <option value="unpaid">Pending or partial</option>
          <option value="Pending">Pending</option>
          <option value="Partially paid">Partially paid</option>
          <option value="Paid">Paid</option>
          <option value="Not recorded">Not recorded</option>
        </select>
      </label>}
    </div>
    <p className="px-5 pt-4 text-xs text-slate-600">{shown.length} of {certificates.length} valuation records</p>
    {!shown.length ? <p className="p-7 text-slate-600">No records match your filters.</p> :
    <div className="overflow-x-auto"><table className="cv-table w-full min-w-[900px]">
      <thead className="bg-slate-50">
        <tr>
          <th className="p-4 text-left">Property / valuation details</th>
          <th className="p-4 text-left">Certificate</th>
          <th className="p-4 text-left">Issued</th>
          <th className="p-4 text-left">Status</th>
          {manager && <th className="p-4 text-left">Job payment (private)</th>}
          <th className="p-4 text-left">Open</th>
        </tr>
      </thead>
      <tbody>
        {shown.map(c=>{
          const names=c.template_id?(prefs.get(c.template_id)??defaults.get(c.template_id)??[]):[];
          const payment=manager?paymentsById.get(c.id):undefined;
          const label=paymentLabel(payment?.fee_amount,payment?.received_amount);
          return <tr key={c.id} className="border-t border-slate-100 align-top hover:bg-slate-50">
            <td className="max-w-[460px] p-4">
              <p className="mb-2 font-bold text-slate-900">{c.templateName}</p>
              <dl className="grid gap-2">
                {names.map(n=>{
                  const f=snapshotField(fieldMap.get(c.id)||[],n);
                  return <div key={n} className="flex gap-2 text-sm">
                    <dt className="max-w-[145px] shrink-0 font-semibold text-slate-500">{n}:</dt>
                    <dd className="break-words font-medium text-slate-900">{f?.field_value?.trim()||"—"}</dd>
                  </div>;
                })}
              </dl>
              {!names.length && <p className="text-xs text-amber-800">No confidently identified fields. Configure display fields for this template.</p>}
              <p className="mt-2 text-xs text-slate-500">Created by {c.createdBy}</p>
            </td>
            <td className="max-w-[200px] break-all p-4 font-mono text-xs text-slate-600">{c.certificate_id}</td>
            <td className="p-4 text-sm text-slate-600">{new Date(c.created_at).toLocaleDateString("en-IN")}</td>
            <td className="p-4 text-sm font-bold text-slate-700">{c.status}</td>
            {manager && <td className="p-4 text-sm">
              <p className={`font-bold ${label==="Paid"?"text-emerald-800":label==="Not recorded"?"text-slate-500":"text-amber-800"}`}>{label}</p>
              {payment?.fee_amount!=null && <p className="mt-1 text-xs text-slate-600">{formatRupees(payment.fee_amount-(payment.received_amount??0))} balance</p>}
              {payment?.bank_name && <p className="mt-1 text-xs text-slate-500">{payment.bank_name} {payment.branch_name}</p>}
            </td>}
            <td className="p-4"><Link className="font-bold text-teal-800 underline-offset-4 hover:underline"
              href={`/dashboard/certificates/${c.id}`}>View certificate</Link>
              {manager && <Link className="mt-2 block text-sm text-slate-600 underline-offset-4 hover:underline"
                href={`/dashboard/certificates/${c.id}#job-payment`}>Track payment</Link>}
            </td>
          </tr>;
        })}
      </tbody>
    </table></div>}
  </section>;
}
