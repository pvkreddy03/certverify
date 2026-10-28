"use client";
import {useEffect,useState} from "react";
import {PlatformMfa} from "@/components/platform-mfa";
import {platformFetch} from "@/lib/platform/client";
import {GeoMap,type GeoMapPoint} from "@/components/geo-map";
type Summary={mapped_count:number;covered_accounts:number;cells:Array<{lat:number;lng:number;count:number}>;privacy:string};
function Dashboard(){
  const [summary,setSummary]=useState<Summary|null>(null);const [error,setError]=useState("");
  useEffect(()=>{let live=true;void platformFetch<Summary>("/api/platform/geo").then(data=>{if(live)setSummary(data);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
  const points:GeoMapPoint[]=(summary?.cells??[]).map((cell,i)=>({id:String(i),lat:cell.lat,lng:cell.lng,title:cell.count+" mapped records (aggregated)",subtitle:"Approximate grid centre"}));
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
    <div className="rounded-2xl bg-[#102b47] p-7 text-white"><h1 className="text-3xl font-bold">Geographical Intelligence</h1><p className="mt-2 text-teal-100">Private platform statistics and coarse, privacy-preserving map coverage. No individual valuation records or client identities are exposed.</p></div>
    {error&&<p role="alert" className="rounded border p-4 text-red-700">{error}</p>}
    {!summary&&!error&&<p>Loading secure geographical analytics…</p>}
    {summary&&<><div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border bg-white p-5"><p className="text-xs text-slate-600">Mapped certificate locations</p><p className="text-3xl font-bold">{summary.mapped_count}</p></div>
      <div className="rounded-xl border bg-white p-5"><p className="text-xs text-slate-600">Contributing workspaces</p><p className="text-3xl font-bold">{summary.covered_accounts}</p></div>
      <div className="rounded-xl border bg-white p-5"><p className="text-xs text-slate-600">Privacy-eligible regional cells</p><p className="text-3xl font-bold">{summary.cells.length}</p></div>
    </div>
    <div className="rounded-xl border bg-white p-5"><h2 className="mb-3 text-xl font-bold">Regional coverage map</h2><GeoMap points={points} center={points[0]??{lat:17.49,lng:78.4}} zoom={8} height={430}/><p className="mt-2 text-xs text-slate-600">{summary.privacy}</p></div>
    <p className="text-sm text-slate-600">Viewing this report requires platform MFA and is audited. Individual customer locations remain isolated. A separate authorization and privacy review is required before any commercial data product.</p></>}
  </main>;
}
export default function AdminGeo(){return <PlatformMfa><Dashboard/></PlatformMfa>;}
