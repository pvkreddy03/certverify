"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {supabase} from "@/lib/supabase";
import {accountHeaders} from "@/lib/accounts/context";
import {GeoMap,type GeoMapPoint} from "@/components/geo-map";
import {geoDistanceKm,geoUrl,type GeoLocation} from "@/lib/geo/location";
import {
  VALUATION_AGE_LEGEND,
  valuationAgeBand,
  valuationAgeInfo,
  type ValuationAgeBand,
} from "@/lib/geo/valuation-age";

type Valuation = {
  id:string;certificate_id:string;template_name:string|null;
  created_at:string;valuation_date:string|null;status:string;
  price_per_sq_meter:number|null;total_property_value:number|null;
  field_name:string;lat:number;lng:number;label:string;
  valuation_metrics?:Array<{name:string;value:string}>;
};
type DatedValuation = Valuation & {ageBand:ValuationAgeBand};

function AgeDot({band}:{band:ValuationAgeBand}) {
  const {color}=valuationAgeInfo(band);
  return <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{backgroundColor:color}}/>;
}

export default function ReferenceMapPage(){
  const [records,setRecords]=useState<Valuation[]>([]);
  const [referenceNow]=useState(()=>Date.now());
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [permissionRequired,setPermissionRequired]=useState(false);
  const [selected,setSelected]=useState<Valuation|null>(null);
  const [center,setCenter]=useState<GeoLocation|null>(null);
  const [radius,setRadius]=useState(0);
  const [months,setMonths]=useState("all");
  const [ageFilter,setAgeFilter]=useState<ValuationAgeBand|"all">("all");
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
        if(response.status===403){if(live)setPermissionRequired(true);return;}
        if(!response.ok)throw new Error(result.error||"Could not load locations.");
        if(live){
          setRecords(result.points??[]);
          const first=result.points?.[0];
          if(first)setCenter({lat:first.lat,lng:first.lng});
        }
      }catch(e){
        if(live)setError(e instanceof Error?e.message:"Could not load locations.");
      }finally{
        if(live)setLoading(false);
      }
    }
    void load();
    return ()=>{live=false;};
  },[]);

  // Age is based ONLY on a recorded valuation date. A newly issued certificate
  // does not make an old valuation recent, and missing dates remain neutral grey.
  const datedRecords=useMemo<DatedValuation[]>(()=>{
    const today=new Date(referenceNow);
    return records.map(record=>({
      ...record,
      ageBand:valuationAgeBand(record.valuation_date,today),
    }));
  },[records,referenceNow]);

  const nearby=useMemo(()=>{
    const query=search.trim().toLowerCase();
    const earliest=months==="all"?0:referenceNow-Number(months)*30.44*86400000;
    return datedRecords.filter(record=>
      (!query||[record.certificate_id,record.template_name??"",record.label??"",record.field_name].some(value=>value.toLowerCase().includes(query))) &&
      (months==="all"||Boolean(record.valuation_date&&new Date(record.valuation_date).getTime()>=earliest)) &&
      (!center||radius===0||geoDistanceKm(center,record)<=radius)
    );
  },[datedRecords,search,months,center,radius,referenceNow]);

  const counts=useMemo(()=>{
    const byBand:Record<ValuationAgeBand,number>={
      "under-6-months":0,"6-to-12-months":0,"1-to-2-years":0,
      "over-2-years":0,unknown:0,
    };
    for(const record of nearby)byBand[record.ageBand]++;
    return byBand;
  },[nearby]);

  const visible=useMemo(()=>ageFilter==="all"?nearby:nearby.filter(record=>record.ageBand===ageFilter),[nearby,ageFilter]);
  const points:GeoMapPoint[]=useMemo(()=>visible.map(record=>({
    id:record.id+":"+record.field_name,
    title:record.certificate_id,
    subtitle:record.template_name??"",
    lat:record.lat,
    lng:record.lng,
    color:valuationAgeInfo(record.ageBand).color,
    ageLabel:valuationAgeInfo(record.ageBand).label,
  })),[visible]);
  const chosen=selected&&visible.find(record=>record.id===selected.id&&record.field_name===selected.field_name);
  const chosenBand=chosen?valuationAgeBand(chosen.valuation_date,new Date(referenceNow)):null;

  if (!loading && permissionRequired) return <main className="cv-page min-h-[65vh] px-4 py-12">
    <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-[#d7e9ed] bg-white shadow-[0_18px_55px_rgba(15,40,55,.09)]">
      <div className="bg-gradient-to-br from-[#102a43] to-[#087f73] px-7 py-8 text-white sm:px-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/><path d="m12 9 2 2m0-2-2 2"/></svg>
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[.16em] text-[#96f0e1]">PRIVATE ORGANIZATION DATA</p>
        <h1 className="mt-2 text-3xl font-extrabold">Reference Map access requires permission</h1>
        <p className="mt-3 text-sm leading-6 text-[#d4f0ed]">Your organization owner has not enabled Reference Map access for this workspace.</p>
      </div>
      <div className="space-y-4 p-7 sm:p-10">
        <p className="text-sm leading-7 text-[#3b5868]">Please ask the main account owner to open <strong>Team → Team Members</strong> and enable <strong>Reference Map access</strong> beside your account. Once permission is granted, reopen this page.</p>
        <p className="rounded-xl bg-[#f2f8fa] p-4 text-xs leading-6 text-[#547080]">You can still create certificates and use other features assigned to your role. Reference Map permission is separate from template access.</p>
        <Link href="/dashboard" className="cv-primary inline-flex">← Return to dashboard</Link>
      </div>
    </section>
  </main>;

  return <main className="cv-page">
    <div className="cv-shell space-y-5">
      <div className="cv-hero">
        <div className="cv-hero__body">
          <p className="cv-eyebrow mb-2">PRIVATE VALUATION HISTORY</p>
          <h1 className="text-3xl font-bold text-white">Valuation Reference Map</h1>
          <p className="mt-2 text-slate-200">
            Find your previous valuation locations by distance, valuation date and template.
            Pin colours indicate how old each recorded valuation is—not its current market relevance.
          </p>
        </div>
      </div>
      <div className="cv-panel space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Find certificates
            <input className="cv-field mt-1" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Certificate, template, location"/>
          </label>
          <label className="text-sm">Distance from map centre
            <select className="cv-field mt-1" value={radius} onChange={event=>setRadius(Number(event.target.value))}>
              <option value={0}>All mapped records</option>
              {[0.5,1,3,5,10,25,100].map(distance=><option value={distance} key={distance}>{distance} km</option>)}
            </select>
          </label>
          <label className="text-sm">Valuation period
            <select className="cv-field mt-1" value={months} onChange={event=>setMonths(event.target.value)}>
              <option value="all">All dates</option>
              <option value="3">Last 3 months</option>
              <option value="6">Last 6 months</option>
              <option value="12">Last year</option>
              <option value="36">Last 3 years</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Choose All mapped records or filter by distance from the map centre.
          Select “Centre on this record” to search around another valuation.
          Up to 1,500 recent location entries are loaded from your own issued certificates.
        </p>

        {loading?<p>Loading private records…</p>:error?<p role="alert" className="text-red-700">{error}</p>:<>
          <section aria-label="Valuation age colour legend" className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">Valuation age · pin colours</h2>
              <span className="text-xs text-slate-500">As of {new Date(referenceNow).toLocaleDateString("en-IN")}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" aria-pressed={ageFilter==="all"} onClick={()=>setAgeFilter("all")}
                className={"rounded-lg border px-3 py-2 text-xs font-semibold "+(ageFilter==="all"?"border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600":"border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
                All ages · {nearby.length}
              </button>
              {VALUATION_AGE_LEGEND.map(band=><button
                type="button" key={band.key} aria-pressed={ageFilter===band.key}
                onClick={()=>setAgeFilter(previous=>previous===band.key?"all":band.key)}
                className={"inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold "+(ageFilter===band.key?"border-teal-600 bg-teal-50 text-teal-900 ring-1 ring-teal-600":"border-slate-200 bg-white text-slate-700 hover:bg-slate-50")}>
                <AgeDot band={band.key}/>{band.label} · {counts[band.key]}
              </button>)}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Select any colour to filter the map and records. Missing or future valuation dates are grey;
              certificate creation date is never used to make a valuation appear newer.
            </p>
          </section>

          <p className="text-sm font-semibold">{visible.length} location records in view · {records.length} records loaded</p>
          <GeoMap center={center} points={points} zoom={12} height={430}
            onPointClick={point=>{
              const found=visible.find(record=>record.id+":"+record.field_name===point.id);
              if(found)setSelected(found);
            }}/>
          {!records.length&&<p>No mapped certificates yet. Create a certificate with a Map Location field to begin your reference library.</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="max-h-96 space-y-2 overflow-auto">
              <h2 className="font-bold">Nearby valuation references</h2>
              {visible.map(record=><button key={record.id+":"+record.field_name}
                type="button" onClick={()=>setSelected(record)}
                className="block w-full rounded-lg border bg-white p-3 text-left hover:border-teal-500">
                <span className="flex flex-wrap items-center gap-2">
                  <AgeDot band={record.ageBand}/>
                  <strong>{record.certificate_id}</strong>
                  <span className="text-sm text-slate-500">{record.template_name||"Untitled template"}</span>
                </span>
                <span className="mt-1 block text-xs font-semibold text-slate-700">
                  {valuationAgeInfo(record.ageBand).label}
                  {" · "}Valuation: {record.valuation_date?new Date(record.valuation_date+"T12:00:00").toLocaleDateString("en-IN"):"Not recorded"}
                </span>
                <span className="mt-1 block text-xs text-slate-600">{record.status} · {center?geoDistanceKm(center,record).toFixed(2)+" km away":""}</span>
              </button>)}
              {records.length>0&&visible.length===0&&<p className="rounded-lg bg-white p-4 text-sm text-slate-600">No records match these filters. Select “All ages” or expand the date/distance filters.</p>}
            </section>
            <section className="rounded-xl border bg-slate-50 p-4">
              <h2 className="font-bold">Selected valuation</h2>
              {chosen&&chosenBand?<div className="mt-3 space-y-2 text-sm">
                <p><strong>Certificate:</strong> {chosen.certificate_id}</p>
                <p><strong>Template:</strong> {chosen.template_name||"—"}</p>
                <p className="flex items-center gap-2"><AgeDot band={chosenBand}/><strong>Age:</strong> {valuationAgeInfo(chosenBand).label}</p>
                <p><strong>Valuation date:</strong> {chosen.valuation_date||"Not recorded"}</p>
                <p><strong>Location:</strong> {chosen.lat.toFixed(6)}, {chosen.lng.toFixed(6)}</p>
                <p><strong>Previously recorded rate:</strong> {chosen.price_per_sq_meter??"Not recorded"} {chosen.price_per_sq_meter!==null?"per sq. metre":""}</p>
                {!!chosen.valuation_metrics?.length&&<div className="rounded-lg border bg-white p-3">
                  <strong>Saved valuation figures (original units)</strong>
                  {chosen.valuation_metrics.map((metric,index)=><p key={index} className="mt-1"><span className="text-slate-600">{metric.name}:</span> {metric.value}</p>)}
                </div>}
                <p className="text-xs text-slate-500">
                  Age colours describe the date only. Historical rates are not independently verified market comparables;
                  confirm currency, unit, purpose and valuation basis before relying on them.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link className="font-semibold text-teal-700 underline" href={"/dashboard/certificates/"+chosen.id}>Open original certificate</Link>
                  <a className="font-semibold text-teal-700 underline" href={geoUrl(chosen)} rel="noopener noreferrer" target="_blank">Open in map</a>
                  <button className="text-teal-700 underline" onClick={()=>setCenter({lat:chosen.lat,lng:chosen.lng})}>Centre on this record</button>
                </div>
              </div>:<p className="mt-3 text-sm text-slate-500">Select a map marker or a record to inspect it.</p>}
            </section>
          </div>
        </>}
      </div>
    </div>
  </main>;
}
