"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {supabase} from "@/lib/supabase";
import {requireSelectedAccountId} from "@/lib/accounts/context";
import {formatRupees,paymentLabel} from "@/lib/valuation/register";
import type {JobPayment} from "@/components/valuation-register";

type Certificate={id:string;certificate_id:string;template_name:string|null;created_at:string;status:string};
type RecordItem=Certificate&{payment:JobPayment|null};

export default function ValuationPaymentsPage(){
  const [records,setRecords]=useState<RecordItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [allowed,setAllowed]=useState(false);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState("outstanding");
  const [updated,setUpdated]=useState(false);
  useEffect(()=>{
    let live=true;
    void Promise.resolve().then(()=>{
      if(live)setUpdated(new URLSearchParams(window.location.search).has("updated"));
    });
    async function load(){
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)throw new Error("Sign in to see job payments.");
      const accountId=requireSelectedAccountId();
      const member=await supabase.from("account_members").select("role").eq("account_id",accountId)
        .eq("user_id",user.id).eq("status","active").maybeSingle();
      if(member.error)throw member.error;
      if(!["owner","admin"].includes(member.data?.role||""))return;
      const [certs,fees]=await Promise.all([
        supabase.from("certificates").select("id,certificate_id,template_name,created_at,status")
          .eq("account_id",accountId).order("created_at",{ascending:false}).limit(1500),
        supabase.from("cv_valuation_job_payments")
          .select("certificate_id,client_name,bank_name,branch_name,fee_amount,received_amount,due_date")
          .eq("account_id",accountId).limit(1500),
      ]);
      if(certs.error)throw certs.error;if(fees.error)throw fees.error;
      const byId=new Map((fees.data??[] as JobPayment[]).map(p=>[p.certificate_id,p]));
      if(live){
        setAllowed(true);
        setRecords((certs.data??[] as Certificate[]).map(c=>({...c,payment:byId.get(c.id)??null})));
      }
    }
    void load().catch(e=>{if(live)setError(e instanceof Error?e.message:"Job payments could not be loaded.")})
      .finally(()=>{if(live)setLoading(false)});
    return()=>{live=false;};
  },[]);
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});
  const outstanding=records.filter(r=>r.payment?.fee_amount!=null&&r.payment.fee_amount>r.payment.received_amount);
  const totalOutstanding=outstanding.reduce((n,r)=>n+(r.payment!.fee_amount!-r.payment!.received_amount),0);
  const filtered=useMemo(()=>records.filter(r=>{
    const p=r.payment, status=paymentLabel(p?.fee_amount,p?.received_amount);
    const due=(p?.due_date??"")<today && !!p?.due_date && ["Pending","Partially paid"].includes(status);
    if(filter==="outstanding" && !["Pending","Partially paid"].includes(status))return false;
    if(filter==="overdue" && !due)return false;
    if(filter==="paid" && status!=="Paid")return false;
    if(filter==="untracked" && status!=="Not recorded")return false;
    const haystack=[
      p?.client_name,p?.bank_name,p?.branch_name,r.certificate_id,r.template_name,
    ].filter(Boolean).join(" ").toLocaleLowerCase("en-IN");
    return haystack.includes(query.trim().toLocaleLowerCase("en-IN"));
  }),[records,filter,query,today]);
  return <main className="cv-page"><div className="cv-shell space-y-6 py-8">
    <Link className="text-sm font-bold text-teal-800" href="/dashboard/certificates/list">← Back to valuation register</Link>
    <header className="rounded-2xl border border-slate-200 bg-white p-6">
      <p className="text-sm font-bold text-teal-800">PRIVATE VALUATION FEES</p>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Job payments &amp; receivables</h1>
      <p className="mt-2 text-base text-slate-600">See which clients and banks still have valuation fees to pay.</p>
    </header>
    {updated&&<p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">Payment details saved. The valuation payment register has been updated.</p>}
    {error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-4 text-red-900">{error}</p>}
    {loading?<p role="status" className="cv-panel p-6">Loading job payments…</p>:
      !allowed?<p role="alert" className="cv-panel p-6">This private fee register is available only to the workspace owner and administrators.</p>:
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="cv-panel p-5"><p className="text-sm text-slate-500">Outstanding valuation fees</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{formatRupees(totalOutstanding)}</p></div>
        <div className="cv-panel p-5"><p className="text-sm text-slate-500">Jobs with unpaid balances</p><p className="mt-2 text-2xl font-extrabold text-amber-800">{outstanding.length}</p></div>
        <div className="cv-panel p-5"><p className="text-sm text-slate-500">Jobs without fee details</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{records.filter(r=>!r.payment||r.payment.fee_amount==null).length}</p></div>
      </div>
      <section className="cv-panel overflow-hidden">
        <div className="flex flex-wrap items-end gap-4 border-b p-5">
          <label className="min-w-48 flex-1 text-sm font-semibold">Search client, bank, branch or certificate
            <input type="search" className="cv-field mt-2" value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. SBI Saidabad or client name"/>
          </label>
          <label className="text-sm font-semibold">Payment status
            <select className="cv-field mt-2" value={filter} onChange={e=>setFilter(e.target.value)}>
              <option value="outstanding">Outstanding</option><option value="overdue">Overdue</option>
              <option value="paid">Paid</option><option value="untracked">Not recorded</option>
              <option value="all">All valuations</option>
            </select></label>
        </div>
        <p className="p-4 text-xs text-slate-500">{filtered.length} matching valuation jobs</p>
        {!filtered.length?<p className="p-6 text-slate-600">No matching jobs. Choose All valuations or Not recorded to set up fees for a certificate.</p>:
        <div className="overflow-x-auto"><table className="cv-table w-full min-w-[950px]">
          <thead className="bg-slate-50"><tr>
            <th className="p-4 text-left">Valuation</th><th className="p-4 text-left">Client / Bank / Branch</th>
            <th className="p-4 text-left">Fee / Received / Balance</th><th className="p-4 text-left">Due date</th>
            <th className="p-4 text-left">Status</th><th className="p-4 text-left">Action</th>
          </tr></thead>
          <tbody>{filtered.map(r=>{
            const p=r.payment,label=paymentLabel(p?.fee_amount,p?.received_amount);
            return <tr key={r.id} className="border-t align-top hover:bg-slate-50">
              <td className="p-4"><p className="font-bold text-slate-900">{r.template_name||"Valuation"}</p>
                <p className="mt-1 max-w-[210px] break-all font-mono text-xs text-slate-500">{r.certificate_id}</p></td>
              <td className="p-4 text-sm">{p?.client_name||"—"}
                {p?.bank_name&&<p className="mt-1 font-semibold">{p.bank_name}</p>}
                {p?.branch_name&&<p className="mt-1 text-xs text-slate-500">{p.branch_name}</p>}</td>
              <td className="p-4 text-sm">
                <p>Agreed: {p?.fee_amount==null?"—":formatRupees(p.fee_amount)}</p>
                <p>Received: {formatRupees(p?.received_amount??0)}</p>
                <p className="font-bold">Due: {p?.fee_amount==null?"—":formatRupees(Math.max(0,p.fee_amount-p.received_amount))}</p>
              </td>
              <td className="p-4 text-sm">{p?.due_date||"Not set"}</td>
              <td className="p-4 text-sm font-bold">{label}</td>
              <td className="p-4"><Link className="text-sm font-bold text-teal-800 underline"
                href={`/dashboard/certificates/${r.id}#job-payment`}>Edit payment</Link></td>
            </tr>;
          })}</tbody>
        </table></div>}
      </section>
    </>}
  </div></main>;
}
