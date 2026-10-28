"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {supabase} from "@/lib/supabase";
import {accountHeaders} from "@/lib/accounts/context";
import {GeoMap,type GeoMapPoint} from "@/components/geo-map";
import {geoDistanceKm,geoUrl,type GeoLocation} from "@/lib/geo/location";
type Valuation={id:string;certificate_id:string;template_name:string|null;created_at:string;valuation_date:string|null;status:string;price_per_sq_meter:number|null;total_property_value:number|null;field_name:string;lat:number;lng:number;label:string};
export default function ReferenceMapPage(){
  const [records,setRecords]=useState<Valuation[]>([]);
  const [referenceNow]=useState(()=>Date.now());
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<Valuation|null>(null);
  const [center,setCenter]=useState<GeoLocation|null>(null);
  const [radius,setRadius]=useState(0);
  const [months,setMonths]=useState("all");
  const [search,setSearch]=useState("");
  useEffect(()=>{
    let live=true;
    async function load(){
      try{
        const {data:{session}}=await supabase.auth.getSession();
        if(!session)throw new Error("Sign in to see your private valuation references.");
        const headers=accountHeaders({Authorization:"Bearer "+session.access_token});
        const response=await fetch("/api/geo/references",{headers,cache:"no-store"});
        const result=await response.json() as {points?:Valuation[];error?:string};
        if(!response.ok)throw new Error(result.error||"Could not load locations.");
        if(live){setRecords(result.points??[]);const first=result.points?.[0];if(first)setCenter({lat:first.lat,lng:first.lng});}
      }catch(e){if(live)setError(e instanceof Error?e.message:"Could not load locations.");}
      finally{if(live)setLoading(false);}
    }
    void load();return ()=>{live=false;};
  },[]);
  const visible=useMemo(()=>{
    const query=search.trim().toLowerCase();
    const earliest=months==="all"?0:referenceNow-Number(months)*30.44*86400000;
    return records.filter(r=>(!query||[r.certificate_id,r.template_name??"",r.label,r.field_name].some(x=>x.toLowerCase().includes(query))) &&
      new Date(r.valuation_date??r.created_at).getTime()>=earliest &&
      (!center||radius===0||geoDistanceKm(center,r)<=radius));
  },[records,search,months,center,radius,referenceNow]);
  const points:GeoMapPoint[]=useMemo(()=>visible.map(r=>({id:r.id+":"+r.field_name,title:r.certificate_id,subtitle:r.template_name??"",lat:r.lat,lng:r.lng})),[visible]);
  const chosen=selected&&visible.find(r=>r.id===selected.id&&r.field_name===selected.field_name);
  return <main className="cv-page"><div className="cv-shell space-y-5">
    <div className="cv-hero"><div className="cv-hero__body"><p className="cv-eyebrow mb-2">PRIVATE VALUATION HISTORY</p><h1 className="text-3xl font-bold text-white">Valuation Reference Map</h1><p className="mt-2 text-slate-200">Find your previous certificate locations by distance, date and template. Locations remain private to the issuing professional.</p></div></div>
    <div className="cv-panel space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm">Find certificates<input className="cv-field mt-1" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Certificate, template, location"/></label>
        <label className="text-sm">Distance from map centre<select className="cv-field mt-1" value={radius} onChange={e=>setRadius(Number(e.target.value))}><option value={0}>All mapped records</option>{[0.5,1,3,5,10,25,100].map(n=><option value={n} key={n}>{n} km</option>)}</select></label>
        <label className="text-sm">Valuation period<select className="cv-field mt-1" value={months} onChange={e=>setMonths(e.target.value)}><option value="all">All dates</option><option value="3">Last 3 months</option><option value="6">Last 6 months</option><option value="12">Last year</option><option value="36">Last 3 years</option></select></label>
      </div>
      <p className="text-xs text-slate-500">Choose All mapped records, or filter by distance from the map centre. Select “Centre on this record” to search around another valuation. Up to 1,500 recent location entries are loaded from your own issued certificates.</p>
      {loading?<p>Loading private records…</p>:error?<p role="alert" className="text-red-700">{error}</p>:<>
        <p className="text-sm font-semibold">{visible.length} location records in view · {records.length} records loaded</p>
        <GeoMap center={center} points={points} zoom={12} height={430}
          onPointClick={p=>{const found=visible.find(r=>r.id===p.id.split(":")[0]&&r.field_name===p.id.split(":").slice(1).join(":"));if(found)setSelected(found);}}/>
        {!records.length&&<p>No mapped certificates yet. Create a certificate with a Map Location field to begin your reference library.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="max-h-96 space-y-2 overflow-auto">
            <h2 className="font-bold">Nearby valuation references</h2>
            {visible.map(r=><button key={r.id+":"+r.field_name} type="button" onClick={()=>setSelected(r)} className="block w-full rounded-lg border bg-white p-3 text-left hover:border-teal-500">
              <strong>{r.certificate_id}</strong><span className="ml-2 text-sm text-slate-500">{r.template_name||"Untitled template"}</span>
              <span className="block text-xs text-slate-600">{new Date(r.valuation_date??r.created_at).toLocaleDateString("en-IN")} · {r.status} · {center?geoDistanceKm(center,r).toFixed(2)+" km away":""}</span>
            </button>)}
          </section>
          <section className="rounded-xl border bg-slate-50 p-4">
            <h2 className="font-bold">Selected valuation</h2>
            {chosen?<div className="mt-3 space-y-2 text-sm">
              <p><strong>Certificate:</strong> {chosen.certificate_id}</p>
              <p><strong>Template:</strong> {chosen.template_name||"—"}</p>
              <p><strong>Valuation date:</strong> {chosen.valuation_date||"Not recorded; showing certificate creation date"}</p>
              <p><strong>Location:</strong> {chosen.lat.toFixed(6)}, {chosen.lng.toFixed(6)}</p>
              <p><strong>Previously recorded rate:</strong> {chosen.price_per_sq_meter??"Not recorded"} {chosen.price_per_sq_meter!==null?"per sq. metre":""}</p>
              <p className="text-xs text-slate-500">Past assessed rates are not independently verified market comparables. Confirm currency, unit and basis before use.</p>
              <div className="flex flex-wrap gap-3"><Link className="font-semibold text-teal-700 underline" href={"/dashboard/certificates/"+chosen.id}>Open original certificate</Link><a className="font-semibold text-teal-700 underline" href={geoUrl(chosen)} rel="noopener noreferrer" target="_blank">Open in map</a><button className="text-teal-700 underline" onClick={()=>setCenter({lat:chosen.lat,lng:chosen.lng})}>Centre on this record</button></div>
            </div>:<p className="mt-3 text-sm text-slate-500">Select a map marker or a record to inspect it.</p>}
          </section>
        </div>
      </>}
    </div>
  </div></main>;
}
