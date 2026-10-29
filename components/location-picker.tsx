"use client";

import {useState} from "react";
import {supabase} from "@/lib/supabase";
import {accountHeaders} from "@/lib/accounts/context";
import {GeoMap} from "@/components/geo-map";
import {geoUrl,parseGeoLocation,serializeGeoLocation,type GeoLocation} from "@/lib/geo/location";
export function LocationPicker({name,value,onChange,disabled=false,required=false}:{
  name:string;value:string;onChange:(value:string)=>void;disabled?:boolean;required?:boolean;
}){
  const point=parseGeoLocation(value);
  const [search,setSearch]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [lat,setLat]=useState("");
  const [lng,setLng]=useState("");
  const [center,setCenter]=useState<GeoLocation|null>(null);
  function select(next:GeoLocation) {onChange(serializeGeoLocation(next));setCenter(next);setNotice("Location selected. Check the pin position before saving.");}
  async function findPlace(){if(busy||search.trim().length<2)return;
    setBusy(true);setNotice("");
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw new Error("Sign in again to search.");
      const headers=accountHeaders({Authorization:"Bearer "+session.access_token});
      const response=await fetch("/api/geo/search?q="+encodeURIComponent(search.trim()),{headers,cache:"no-store"});
      const result=await response.json() as {error?:string;lat?:number;lng?:number;label?:string};
      if(!response.ok||typeof result.lat!=="number"||typeof result.lng!=="number")throw new Error(result.error||"No matching area found.");
      // Search finds a general area; the user confirms a separate exact pin.
      setCenter({lat:result.lat,lng:result.lng,source:"search",label:result.label});
      setNotice("Map moved to the searched area. Click the property location to save its pin.");
    }catch(e){setNotice(e instanceof Error?e.message:"Location search unavailable.");}
    finally{setBusy(false);}
  }
  function gps(){
    if(!navigator.geolocation){setNotice("This browser does not support GPS.");return;}
    setBusy(true);
    navigator.geolocation.getCurrentPosition(position=>{
      select({lat:position.coords.latitude,lng:position.coords.longitude,source:"gps"});
      setBusy(false);
    },()=>{setNotice("Location permission was denied or location could not be determined. Use the map or coordinates.");setBusy(false);},
    {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  }
  function manual(){
    try{select({lat:Number(lat),lng:Number(lng),source:"coordinates"});}
    catch(e){setNotice(e instanceof Error?e.message:"Invalid coordinates.");}
  }
  return <div className="w-full min-w-0 space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3 sm:p-5">
    <p className="text-sm font-semibold text-slate-900">{name}{required?" *":""}</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label={"Search area for "+name} type="search" value={search} onChange={e=>setSearch(e.target.value)}
        onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();event.stopPropagation();if(!disabled)void findPlace();}}}
        placeholder="Area or town, e.g. Kukatpally, Hyderabad" maxLength={100} disabled={disabled||busy}
        className="min-w-0 flex-1 rounded-lg border p-2 text-sm" />
      <button type="button" onClick={()=>{void findPlace();}} disabled={disabled||busy||search.trim().length<2} className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Search area</button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={gps} disabled={disabled||busy} className="rounded-lg border bg-white px-3 py-2 text-sm">Use My Current Location</button>
      <span className="text-xs text-slate-500">Or tap the map to place your pin</span>
    </div>
    <GeoMap center={center} value={point} height={500} onPick={disabled?undefined:(picked)=>select({...picked,label:point?.label})}/>
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <input aria-label={name+" latitude"} type="number" step="any" value={lat} onChange={e=>setLat(e.target.value)} placeholder="Latitude" disabled={disabled} className="min-w-0 rounded-lg border p-2 text-sm"/>
      <input aria-label={name+" longitude"} type="number" step="any" value={lng} onChange={e=>setLng(e.target.value)} placeholder="Longitude" disabled={disabled} className="min-w-0 rounded-lg border p-2 text-sm"/>
      <button type="button" onClick={manual} disabled={disabled||lat.trim()===""||lng.trim()===""} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Set coordinates</button>
    </div>
    {point && <p className="text-sm text-teal-900">Selected: {point.lat.toFixed(6)}, {point.lng.toFixed(6)} · <a href={geoUrl(point)} target="_blank" rel="noopener noreferrer" className="underline">Open map</a> · <button type="button" disabled={disabled} className="underline" onClick={()=>{onChange("");setNotice("Pin cleared.");}}>Clear pin</button></p>}
    {notice&&<p role="status" className="text-xs text-slate-700">{notice}</p>}
    <p className="text-xs text-slate-500">Search is approximate. Confirm the final pin yourself; it is not a survey measurement. Device location needs permission. Exact coordinates stay private unless this field is marked public.</p>
    <input type="text" required={required} value={value} readOnly tabIndex={-1} aria-label={name+" selected coordinates"} className="sr-only" />
  </div>;
}
