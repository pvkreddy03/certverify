"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { accountHeaders } from "@/lib/accounts/context";
type Item={id:string;certificateId:string;publicReference:string;sourceRow:number;status:string};
type Batch={id:string;name:string;sourceName:string;rowCount:number;createdAt:string;items:Item[]};
async function download(id:string,format:"jpeg"|"png"){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error("Please sign in again.");
  const headers=accountHeaders({"Content-Type":"application/json",Authorization:"Bearer "+session.access_token});
  const response=await fetch("/api/bulk/download",{method:"POST",headers,body:JSON.stringify({batchId:id,format})});
  if(!response.ok)throw new Error((await response.json()).error||"Could not download the QR ZIP.");
  const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;anchor.download="certverify-batch-"+format+".zip";anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function BulkBatchPage(){
  const {batchId}=useParams<{batchId:string}>();
  const [batch,setBatch]=useState<Batch|null>(null);
  const [error,setError]=useState("");
  const [working,setWorking]=useState(false);
  useEffect(()=>{
    void supabase.rpc("cv_bulk_batch_details",{p_batch:batchId}).then(({data,error})=>{
      if(error||!data)setError("This import batch is unavailable in your selected organization.");
      else setBatch(data as Batch);
    });
  },[batchId]);
  async function exportBatch(format:"jpeg"|"png"){
    if(!batch)return;setWorking(true);setError("");
    try{await download(batch.id,format);}
    catch(e){setError(e instanceof Error?e.message:"Download failed.");}
    finally{setWorking(false);}
  }
  return <main className="cv-page min-h-screen">
    <div className="cv-shell space-y-6 cv-entrance">
    <Link className="text-sm font-bold text-[#0f857c]" href="/dashboard/certificates/bulk">← Bulk imports</Link>
    <header className="cv-hero"><div className="cv-hero__body">
      <p className="cv-eyebrow mb-3">BULK IMPORT HISTORY</p>
      <h1 className="text-3xl font-extrabold !text-white">Bulk import details</h1>
      <p className="mt-3 text-sm text-[#d2e5ec]">Your certificates remain individually verifiable and accessible from this batch.</p>
    </div></header>
    {error&&<p role="alert" className="rounded bg-red-50 p-4 text-red-700">{error}</p>}
    {!batch&&!error?<p>Loading certificates…</p>:batch&&<>
      <section className="cv-panel p-6 sm:p-8">
        <h2 className="text-xl font-semibold">{batch.name}</h2>
        <p className="mt-2 text-slate-600">{batch.items.length} individually issued certificates · Excel file: {batch.sourceName}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={working} onClick={()=>void exportBatch("jpeg")} className="cv-primary disabled:opacity-50">Download all QRs (JPEG ZIP)</button>
          <button disabled={working} onClick={()=>void exportBatch("png")} className="cv-secondary disabled:opacity-50">Download PNG ZIP</button>
        </div>
        <p className="mt-2 text-sm text-slate-500">The ZIP includes a certificate-to-verification-link CSV. QR images are generated when downloaded, not permanently stored.</p>
      </section>
      <div className="cv-panel overflow-x-auto">
        <table className="cv-table">
          <thead className="bg-slate-100"><tr><th className="p-3">Excel row</th><th className="p-3">Certificate ID</th><th className="p-3">Status</th><th className="p-3">Certificate</th></tr></thead>
          <tbody>{batch.items.map(item=><tr key={item.id} className="border-t">
            <td className="p-3">{item.sourceRow}</td>
            <td className="p-3 font-semibold">{item.certificateId}</td>
            <td className="p-3">{item.status}</td>
            <td className="p-3"><Link className="font-semibold text-blue-700" href={"/dashboard/certificates/"+item.id}>View / QR</Link></td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    </div>
  </main>;
}