"use client";

import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {supabase} from "@/lib/supabase";
import {requireSelectedAccountId} from "@/lib/accounts/context";
import {formatRupees,paymentLabel} from "@/lib/valuation/register";

type JobPayment={
  fee_amount:number|null;received_amount:number;client_name:string;
  bank_name:string;branch_name:string;due_date:string|null;notes:string;
};

export function ValuationJobPayment({certificateId}:{certificateId:string}){
  const router=useRouter();
  const [allowed,setAllowed]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [fee,setFee]=useState("");
  const [received,setReceived]=useState("0");
  const [clientName,setClientName]=useState("");
  const [bankName,setBankName]=useState("");
  const [branchName,setBranchName]=useState("");
  const [due,setDue]=useState("");
  const [notes,setNotes]=useState("");
  const lock=useRef(false);

  useEffect(()=>{
    let active=true;
    async function load(){
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)return;
      const acc=requireSelectedAccountId();
      const membership=await supabase.from("account_members").select("role")
        .eq("account_id",acc).eq("user_id",user.id).eq("status","active").maybeSingle();
      if(membership.error)throw membership.error;
      const manager=membership.data?.role==="owner"||membership.data?.role==="admin";
      if(!manager){if(active)setAllowed(false);return;}
      const record=await supabase.from("cv_valuation_job_payments").select("*")
        .eq("account_id",acc).eq("certificate_id",certificateId).maybeSingle();
      if(record.error)throw record.error;
      if(!active)return;
      const v=record.data as JobPayment|null;
      if(v){
        setFee(v.fee_amount==null?"":String(v.fee_amount));
        setReceived(String(v.received_amount));
        setClientName(v.client_name);
        setBankName(v.bank_name);
        setBranchName(v.branch_name);
        setDue(v.due_date||"");
        setNotes(v.notes);
      }
      setAllowed(true);
    }
    void load().catch(e=>{if(active)setError(e instanceof Error?e.message:"Payment details could not be loaded.");})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[certificateId]);

  async function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(lock.current||saving)return;
    lock.current=true;setSaving(true);setError("");
    try{
      const amount=fee.trim()===""?null:Number(fee);
      const collected=Number(received||0);
      if(amount!==null&&(!Number.isFinite(amount)||amount<=0))throw new Error("Enter a positive agreed fee.");
      if(!Number.isFinite(collected)||collected<0||(amount===null&&collected!==0)||(amount!==null&&collected>amount))
        throw new Error("Amount received must be between zero and the agreed fee.");
      const {error}=await supabase.rpc("cv_save_valuation_job_payment",{
        p_certificate:certificateId,p_client:clientName.trim(),
        p_bank:bankName.trim(),p_branch:branchName.trim(),
        p_fee:amount,p_received:collected,p_due:due||null,p_notes:notes.trim(),
      });
      if(error)throw error;
      // One successful click navigates to the payment register; repeated submissions
      // are blocked during the transition and never double-record a receipt.
      router.push("/dashboard/valuation-payments?updated=1");
    }catch(e){setError(e instanceof Error?e.message:"Payment details could not be saved.");lock.current=false;setSaving(false);}
  }
  if(loading)return <section className="rounded-2xl border bg-white p-6" id="job-payment"><p>Loading private job-payment details…</p></section>;
  if(!allowed)return error?<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>:null;
  const total=fee.trim()?Number(fee):null,paid=Number(received||0);
  return <section id="job-payment" className="scroll-mt-28 rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-teal-700">PRIVATE VALUATION FEES</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">Job payment tracker</h2>
        <p className="mt-2 text-sm text-slate-600">Manual fee ledger for this valuation. Separate from ValuerSeal subscription billing; never visible to a public QR scan.</p></div>
      <Link href="/dashboard/valuation-payments" className="text-sm font-bold text-teal-800 underline">All job payments</Link>
    </div>
    <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm">
      <span className="font-bold">{paymentLabel(total,paid)}</span>
      {total!==null&&<span className="ml-3 text-slate-700">Outstanding: {formatRupees(Math.max(0,total-paid))}</span>}
    </div>
    <form onSubmit={save} className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Client / person responsible for payment
          <input className="cv-field mt-1" value={clientName} maxLength={160} onChange={e=>setClientName(e.target.value)} placeholder="Client or employer" disabled={saving}/></label>
        <label className="text-sm font-semibold">Bank / institution (if applicable)
          <input className="cv-field mt-1" value={bankName} maxLength={160} onChange={e=>setBankName(e.target.value)} placeholder="Bank or NBFC name" disabled={saving}/></label>
        <label className="text-sm font-semibold">Bank branch
          <input className="cv-field mt-1" value={branchName} maxLength={160} onChange={e=>setBranchName(e.target.value)} placeholder="Branch" disabled={saving}/></label>
        <label className="text-sm font-semibold">Payment due date
          <input type="date" className="cv-field mt-1" value={due} onChange={e=>setDue(e.target.value)} disabled={saving}/></label>
        <label className="text-sm font-semibold">Agreed valuation fee (₹)
          <input type="number" min="0.01" max="999999999999.99" step="0.01" className="cv-field mt-1" value={fee} onChange={e=>setFee(e.target.value)} placeholder="e.g. 2500" disabled={saving}/></label>
        <label className="text-sm font-semibold">Total received so far (₹)
          <input type="number" min="0" step="0.01" className="cv-field mt-1" value={received} onChange={e=>setReceived(e.target.value)} disabled={saving}/></label>
      </div>
      <label className="block text-sm font-semibold">Internal payment notes
        <textarea className="mt-1 w-full rounded-xl border border-slate-300 p-3" rows={2} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} disabled={saving}/></label>
      {error&&<p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-red-900">{error}</p>}
      <button className="cv-primary disabled:opacity-50" disabled={saving}>{saving?"Saving and opening payment register…":"Save payment details"}</button>
    </form>
  </section>;
}
