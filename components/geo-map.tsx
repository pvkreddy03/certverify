"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoLocation } from "@/lib/geo/location";

const EMPTY_POINTS:GeoMapPoint[]=[];
export type GeoMapPoint = GeoLocation & { id: string; title: string; subtitle?: string; color?: string; ageLabel?: string };
type Coordinate = { lng: number; lat: number };
type MapInstance = {
  on: (event:string,fn:(event:{lngLat:Coordinate})=>void)=>void;
  flyTo:(options:{center:[number,number];zoom?:number})=>void;
  remove:()=>void;
  addControl:(control:unknown,position?:string)=>void;
};
type MarkerInstance={setLngLat:(v:[number,number])=>MarkerInstance;addTo:(map:MapInstance)=>MarkerInstance};
type MapLibrary={
  Map:new(options:Record<string,unknown>)=>MapInstance;
  Marker:new(options?:Record<string,unknown>)=>MarkerInstance;
  NavigationControl:new()=>unknown;
};
declare global { interface Window { maplibregl?:MapLibrary; __cvMapLibreLoading?:Promise<MapLibrary> } }
function loadMapLibre():Promise<MapLibrary> {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (window.__cvMapLibreLoading) return window.__cvMapLibreLoading;
  const style=document.createElement("link");
  style.rel="stylesheet";style.href="https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.css";
  document.head.appendChild(style);
  window.__cvMapLibreLoading=new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/maplibre-gl@5.6.1/dist/maplibre-gl.js";
    script.async=true;
    script.onload=()=>window.maplibregl?resolve(window.maplibregl):reject(new Error("Map renderer unavailable"));
    script.onerror=()=>reject(new Error("Unable to load map controls"));
    document.head.appendChild(script);
  });
  return window.__cvMapLibreLoading;
}
export function GeoMap({center, value, onPick, points=EMPTY_POINTS, onPointClick, zoom=14, height=360}:{
  center?:GeoLocation|null;value?:GeoLocation|null;
  onPick?:(value:GeoLocation)=>void;points?:GeoMapPoint[];
  onPointClick?:(point:GeoMapPoint)=>void;zoom?:number;height?:number;
}) {
  const node=useRef<HTMLDivElement>(null);
  const map=useRef<MapInstance|null>(null);
  const pickRef=useRef(onPick);
  const clickRef=useRef(onPointClick);
  const [error,setError]=useState("");
  useEffect(()=>{pickRef.current=onPick;clickRef.current=onPointClick;},[onPick,onPointClick]);
  useEffect(()=>{
    let mounted=true;
    void loadMapLibre().then(lib=>{
      if (!mounted || !node.current) return;
      const start=center??value??points[0]??{lat:17.4933,lng:78.3995};
      const view=new lib.Map({
        container:node.current,
        style:process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty",
        center:[start.lng,start.lat],zoom,attributionControl:true,
      });
      map.current=view;
      view.addControl(new lib.NavigationControl(),"top-right");
      if (pickRef.current) view.on("click",(event)=>{
        pickRef.current?.({lat:event.lngLat.lat,lng:event.lngLat.lng,source:"pin"});
      });
      if (value) new lib.Marker({color:"#e34b58"}).setLngLat([value.lng,value.lat]).addTo(view);
      for (const item of points) {
        const marker=document.createElement("button");
        marker.type="button";
        marker.title=item.ageLabel ? item.title+" — "+item.ageLabel : item.title;
        marker.setAttribute("aria-label","Open "+marker.title);
        marker.style.cssText="border:2px solid white;border-radius:100%;width:22px;height:22px;box-shadow:0 2px 9px #0c303d88;cursor:pointer";
        marker.style.backgroundColor=item.color??"#087e75";
        marker.addEventListener("click",(event)=>{event.stopPropagation();clickRef.current?.(item);});
        new lib.Marker({element:marker}).setLngLat([item.lng,item.lat]).addTo(view);
      }
    }).catch(()=>{if(mounted)setError("Map tiles could not be loaded. Manual coordinates and links remain available.");});
    return ()=>{mounted=false;map.current?.remove();map.current=null;};
    // Rebuild only when markers/selected location change; center changes use flyTo below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[value?.lat,value?.lng,points]);
  useEffect(()=>{if(center&&map.current)map.current.flyTo({center:[center.lng,center.lat],zoom});},[center?.lat,center?.lng,zoom]);
  return <div className="space-y-2">
    <div ref={node} style={{height}} className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100" aria-label="Interactive property location map"/>
    {error&&<p role="alert" className="text-xs text-amber-800">{error}</p>}
    <p className="text-xs text-slate-600">Map data © OpenStreetMap contributors · Tiles by OpenFreeMap. Pins indicate reported locations, not verified property boundaries.</p>
  </div>;
}
