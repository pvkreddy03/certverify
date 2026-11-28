"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {supabase} from "@/lib/supabase";
import {requireSelectedAccountId} from "@/lib/accounts/context";
import {generateCertificateId,createCertificate} from "@/lib/repositories/certificates";
import {createCertificateFieldValues} from "@/lib/repositories/certificate-fields";
import {LocationPicker} from "@/components/location-picker";
import {parseGeoLocation} from "@/lib/geo/location";
import {STANDARD_TEMPLATE,STANDARD_DESCRIPTION,STANDARD_FIELDS,CALCULATED_FIELDS,PROPERTY_TYPES,applies,calculateStandard,validateStandard,type PropertyType} from "@/lib/valuation/standard";

export default function StandardValuationPage(){
 const router=useRouter();
 const [type,setType]=useState<PropertyType>("Open plot");
 const [values,setValues]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [recordId,setRecordId]=useState("");
 const [templateId,setTemplateId]=useState("");
 const [ready,setReady]=useState(false);
 const [canSetup,setCanSetup]=useState(false);
 const lock=useRef(false);
 const groups=Array.from(new Set(STANDARD_FIELDS.map(f=>f.group)));
 const calculated=calculateStandard(type,values);
 const update=(name:string,value:string)=>setValues(previous=>({...previous,[name]:value}));
 useEffect(()=>{
  let active=true;
  async function load(){
   try{
    const account=requireSelectedAccountId();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)throw new Error("Sign in first.");
    const [templates,member]=await Promise.all([
     supabase.from("certificate_templates").select("id").eq("account_id",account).eq("name",STANDARD_TEMPLATE).eq("description",STANDARD_DESCRIPTION).order("created_at").limit(1),
     supabase.from("account_members").select("role,can_manage_templates").eq("account_id",account).eq("user_id",user.id).eq("status","active").maybeSingle()
    ]);
    if(templates.error)throw new Error(templates.error.message);
    if(member.error)throw new Error(member.error.message);
    if(active){setTemplateId(templates.data?.[0]?.id||"");setCanSetup(member.data?.role==="owner"||member.data?.role==="admin"||member.data?.can_manage_templates===true);setReady(true);}
   }catch(e){if(active)setMessage(e instanceof Error?e.message:"Unable to load workspace.");}
  }
  void load();return()=>{active=false;};
 },[]);
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(lock.current||recordId)return;
  lock.current=true;setBusy(true);setMessage("");
  let inserted="";
  try{
   validateStandard(type,values);
   if(!parseGeoLocation(values["Map location"]))throw new Error("Choose a valid property location.");
   const account=requireSelectedAccountId();
   const {data:{user}}=await supabase.auth.getUser();
   if(!user)throw new Error("Sign in first.");
   let tid=templateId;
   if(!tid){
    if(!canSetup)throw new Error("Ask your workspace owner to initialize the standard form once.");
    // Recheck before provisioning. Never rename, overwrite or remove an existing template.
    const existing=await supabase.from("certificate_templates").select("id").eq("account_id",account).eq("name",STANDARD_TEMPLATE).eq("description",STANDARD_DESCRIPTION).order("created_at").limit(1);
    if(existing.error)throw new Error(existing.error.message);
    tid=existing.data?.[0]?.id||"";
    if(!tid){
     const created=await supabase.from("certificate_templates").insert({user_id:user.id,account_id:account,name:STANDARD_TEMPLATE,description:STANDARD_DESCRIPTION}).select("id").single();
     if(created.error)throw new Error(created.error.message);
     tid=created.data.id;
    }
    setTemplateId(tid);
   }
   // Field values are snapshots, exactly as for historical certificates.
   const fields=STANDARD_FIELDS.map((field,index)=>{
    const value=field.name==="Property value basis"?type:!applies(field,type)?"N/A":values[field.name]?.trim()||null;
    return {field_name:field.name,field_type:value==="N/A"?"text":field.type,field_value:value,is_public:false,display_order:index+1};
   });
   const metrics=CALCULATED_FIELDS.map((name,index)=>({field_name:name,field_type:calculated[name as keyof typeof calculated]==="N/A"?"text":"number",field_value:calculated[name as keyof typeof calculated],is_public:false,display_order:STANDARD_FIELDS.length+index+1}));
   // Keep the map's capped legacy metric lookup useful: basis and rate fields first.
   const priorities=["Property value basis","Adopted land rate (INR/sq yd)","Combined flat rate (INR/sq ft)","Construction rate (INR/sq ft)","Land value (INR)","Net construction valuation amount (INR)","Fair market value (INR)","Date of valuation"];
   const all=[...fields,...metrics].map(field=>{const priority=priorities.indexOf(field.field_name);return {...field,display_order:priority<0?field.display_order+20:priority+1};});
   const id=await generateCertificateId(account);
   const record=await createCertificate({user_id:user.id,account_id:account,certificate_id:id,template_id:tid,status:"Active"});
   inserted=record.id;setRecordId(inserted);
   await createCertificateFieldValues(all.map(field=>({...field,certificate_id:inserted})));
   router.replace("/dashboard/certificates/"+inserted+"?created=1");
  }catch(e){
   setMessage(inserted?"The record was created, but details may be incomplete. Open it to review; do not issue a duplicate.":e instanceof Error?e.message:"Could not save.");
   if(!inserted)lock.current=false;
  }finally{if(!inserted)setBusy(false);}
 }
 return <main className="cv-page"><div className="cv-shell max-w-6xl space-y-5">
  <header className="cv-panel p-6"><p className="text-sm font-bold text-teal-800">VALUERSEAL · STANDARD FORM</p><h1 className="mt-2 text-3xl font-extrabold">New Land &amp; Building Valuation</h1><p className="mt-2 text-slate-600">One report for all property types. Inapplicable sections are marked N/A. Your earlier templates remain available.</p><Link href="/dashboard/certificates?custom=1" className="mt-3 inline-block text-sm font-semibold text-teal-800 underline">Use an existing custom form / replacement instead</Link></header>
  {message&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4">{message}</p>}
  {recordId&&<Link className="cv-primary inline-block" href={"/dashboard/certificates/"+recordId}>Open saved valuation</Link>}
  {!ready?<p role="status">Loading workspace permissions…</p>:!templateId&&!canSetup?<p className="cv-panel p-5">Ask the workspace owner to save the first standard valuation to initialize the standard form. Your existing templates are still available.</p>:<form onSubmit={save} className="space-y-5">
   <section className="cv-panel p-5"><label className="font-bold">Property type<select className="cv-field mt-2" value={type} disabled={busy} onChange={e=>{const next=e.target.value as PropertyType;setType(next);setValues(previous=>Object.fromEntries(Object.entries(previous).filter(([name])=>{const field=STANDARD_FIELDS.find(f=>f.name===name);return !field||applies(field,next);})));}}>{PROPERTY_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>{(type==="Open plot"||type==="Agricultural land")&&<p className="mt-2 text-sm text-slate-500">Building-related fields will be N/A.</p>}{type==="Villa"&&<p className="mt-2 text-sm text-slate-500">Enter UDS if stated in title documents; value only the adopted land interest, not both.</p>}</section>
   {groups.map(group=><section className="cv-panel p-5 sm:p-7" key={group}><h2 className="mb-4 text-lg font-bold">{group}</h2>
    <div className="grid gap-4 md:grid-cols-2">{STANDARD_FIELDS.filter(field=>field.group===group&&field.name!=="Property value basis").map(field=>{
     const applicable=applies(field,type);
     if(!applicable)return <div className="rounded-lg bg-slate-50 p-2 text-sm text-slate-500" key={field.name}>{field.name}: N/A</div>;
     const required=Boolean(field.required||(type==="Apartment / flat"&&field.name==="Undivided share (UDS) (sq yd)"));
     return <div key={field.name} className={field.multiline||field.type==="location"?"md:col-span-2":""}><label className="mb-1 block text-sm font-semibold">{field.name}{required?" *":""}</label>
     {field.type==="location"?<LocationPicker name={field.name} value={values[field.name]||""} onChange={v=>update(field.name,v)} disabled={busy} required={required}/>:field.multiline?<textarea rows={3} className="cv-field" value={values[field.name]||""} onChange={e=>update(field.name,e.target.value)} required={required} disabled={busy}/>:<input className="cv-field" aria-label={field.name} type={field.type} min={field.type==="number"?0:undefined} step={field.type==="number"?"any":undefined} value={values[field.name]||""} onChange={e=>update(field.name,e.target.value)} required={required} disabled={busy}/>}
     </div>;
    })}</div>
   </section>)}
   <section className="cv-panel p-5"><h2 className="font-bold text-lg">Calculated valuation summary</h2><p className="text-sm text-slate-600">Review adopted inputs. Combined flat rate uses land plus depreciated building value, divided by adopted flat area. Extras are excluded from that unit rate.</p><dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(calculated).map(([name,value])=><div className="rounded-lg bg-slate-50 p-3" key={name}><dt className="text-sm text-slate-600">{name}</dt><dd className="font-bold">{value==="N/A"?value:"₹"+Number(value).toLocaleString("en-IN",{maximumFractionDigits:2})}</dd></div>)}</dl>
    <button type="submit" disabled={busy||!!recordId} className="cv-primary mt-5 disabled:opacity-50">{busy?"Saving valuation…":"Save valuation & prepare report"}</button>
   </section>
  </form>}
 </div></main>;
}
