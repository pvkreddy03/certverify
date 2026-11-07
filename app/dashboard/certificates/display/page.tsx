"use client";

import { useEffect,useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";
import { suggestedDisplayFields } from "@/lib/valuation/register";

type Template={id:string;name:string};
type Field={template_id:string;field_name:string;display_order?:number};
type CertificateRef={id:string;template_id:string|null};
type Snapshot={certificate_id:string;field_name:string};

export default function ValuationDisplayPage(){
  const router=useRouter();
  const [templates,setTemplates]=useState<Template[]>([]);
  const [catalog,setCatalog]=useState<Record<string,string[]>>({});
  const [selected,setSelected]=useState<Record<string,string[]>>({});
  const [loading,setLoading]=useState(true);
  const [authorized,setAuthorized]=useState(false);
  const [saving,setSaving]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const [userId,setUserId]=useState("");
  useEffect(()=>{
    let live=true;
    async function load(){
      const {data:{user}}=await supabase.auth.getUser();
      if(!user)throw new Error("Sign in to manage your register.");
      const accountId=requireSelectedAccountId();
      const member=await supabase.from("account_members").select("role")
        .eq("account_id",accountId).eq("user_id",user.id).eq("status","active").maybeSingle();
      const allowed=!!member.data&&["owner","admin"].includes(member.data.role);
      if(!allowed){if(live){setAuthorized(false);setLoading(false);}return;}
      const [tr,fr,cr,pr]=await Promise.all([
        supabase.from("certificate_templates").select("id,name").eq("account_id",accountId).order("name"),
        supabase.from("certificate_fields").select("template_id,field_name,display_order").order("display_order").limit(2000),
        supabase.from("certificates").select("id,template_id").eq("account_id",accountId).limit(1500),
        supabase.from("cv_valuation_display_config").select("template_id,field_names").eq("account_id",accountId),
      ]);
      const e=[tr,fr,cr,pr].find(x=>x.error)?.error;
      if(e)throw new Error(e.message);
      const refs=(cr.data??[]) as CertificateRef[];
      const names=(fr.data??[]) as Field[];
      if(refs.length){
        const sr=await supabase.from("certificate_field_values")
          .select("certificate_id,field_name").in("certificate_id",refs.map(x=>x.id)).limit(5000);
        if(sr.error)throw new Error(sr.error.message);
        const refToTemplate=new Map(refs.map(x=>[x.id,x.template_id]));
        for(const f of (sr.data??[]) as Snapshot[]){
          const templateId=refToTemplate.get(f.certificate_id);
          if(templateId)names.push({template_id:templateId,field_name:f.field_name});
        }
      }
      const options:Record<string,string[]>={};
      for(const t of (tr.data??[]) as Template[]){
        options[t.id]=[];
      }
      for(const f of names){
        if(!f.template_id || !options[f.template_id])continue;
        if(!options[f.template_id].includes(f.field_name))options[f.template_id].push(f.field_name);
      }
      const configured=new Map((pr.data??[]).map(p=>[p.template_id,p.field_names as string[]]));
      const initial:Record<string,string[]>={};
      for(const [id,labels] of Object.entries(options)){
        initial[id]=configured.has(id)?configured.get(id)!.filter(f=>labels.includes(f)):suggestedDisplayFields(labels);
      }
      if(live){
        setTemplates(tr.data??[]);
        setCatalog(options);
        setSelected(initial);
        setUserId(user.id);
        setAuthorized(true);
        setLoading(false);
      }
    }
    void load().catch(error=>{if(live){setMessage(error instanceof Error?error.message:"Unable to load register setup.");setLoading(false);}});
    return()=>{live=false;};
  },[]);

  function toggle(tid:string,label:string,checked:boolean){
    setSelected(old=>{
      const current=old[tid]||[];
      if(checked && current.length>=8){setMessage("Select up to eight fields per template.");return old;}
      return {...old,[tid]:checked?[...current.filter(n=>n!==label),label]:current.filter(n=>n!==label)};
    });
  }
  function move(tid:string,label:string,direction:-1|1){
    setSelected(old=>{
      const next=[...(old[tid]||[])],index=next.indexOf(label),target=index+direction;
      if(index<0||target<0||target>=next.length)return old;
      [next[index],next[target]]=[next[target],next[index]];
      return {...old,[tid]:next};
    });
  }
  async function save(tid:string){
    if(saving)return;
    setSaving(tid);setMessage("");
    try{
      const field_names=selected[tid]||[];
      const valid=catalog[tid]||[];
      if(field_names.length>8||field_names.some(name=>!valid.includes(name)))throw new Error("Choose only fields listed for this template.");
      const {error}=await supabase.from("cv_valuation_display_config").upsert({
        account_id:requireSelectedAccountId(),template_id:tid,
        field_names,updated_by:userId,updated_at:new Date().toISOString(),
      },{onConflict:"account_id,template_id"});
      if(error)throw error;
      // Navigate on success instead of inviting repeated clicks.
      router.push("/dashboard/certificates/list");
    }catch(error){setMessage(error instanceof Error?error.message:"Unable to save display preferences.");setSaving(null);}
  }

  return <main className="cv-page"><div className="cv-shell space-y-6 py-8">
    <Link className="text-sm font-bold text-teal-800" href="/dashboard/certificates/list">← Back to valuation register</Link>
    <header><p className="cv-eyebrow">VALUATION REGISTER SETTINGS</p>
      <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Choose certificate list fields</h1>
      <p className="mt-2 max-w-3xl text-slate-600">Select up to eight actual fields for each valuation template. Arrange the order with arrows. Original field names remain visible, so an unrelated client, agent or price field is never renamed as a property owner or location.</p>
    </header>
    {message&&<p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4">{message}</p>}
    {loading?<p role="status">Loading templates and saved values…</p>:!authorized?
      <p role="alert">Only the organization owner or administrator can change these settings.</p>:
      templates.map(t=><section key={t.id} className="cv-panel space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-bold text-[#17354b]">{t.name}</h2>
            <p className="mt-1 text-sm text-slate-500">Showing {(selected[t.id]||[]).length} of 8 available positions.</p></div>
          <button disabled={!!saving} onClick={()=>void save(t.id)} className="cv-primary disabled:opacity-50">{saving===t.id?"Saving…":"Save & return to register"}</button>
        </div>
        {(catalog[t.id]||[]).length===0?<p className="text-slate-600">No certificate fields found. Add fields to this template first.</p>:
        <div className="grid gap-6 md:grid-cols-2">
          <div><h3 className="mb-3 font-semibold">Available fields</h3>
            <div className="space-y-2">{catalog[t.id].map(label=><label key={label} className="flex items-center gap-3 rounded border p-3 text-sm">
              <input type="checkbox" checked={(selected[t.id]||[]).includes(label)} onChange={e=>toggle(t.id,label,e.target.checked)} disabled={!!saving}/>
              <span>{label}</span>
            </label>)}</div></div>
          <div><h3 className="mb-3 font-semibold">Display order</h3>
            {!(selected[t.id]||[]).length?<p className="text-sm text-slate-500">Select fields on the left. If no field is selected, the register shows a prompt instead of guessing.</p>:
            <ol className="space-y-2">{(selected[t.id]||[]).map((label,i)=><li key={label} className="flex items-center gap-2 rounded border bg-slate-50 p-2">
              <span className="flex-1 text-sm font-medium">{i+1}. {label}</span>
              <button type="button" aria-label={`Move ${label} up`} disabled={i===0||!!saving} onClick={()=>move(t.id,label,-1)} className="rounded border bg-white px-3 py-1 disabled:opacity-30">↑</button>
              <button type="button" aria-label={`Move ${label} down`} disabled={i===(selected[t.id]||[]).length-1||!!saving} onClick={()=>move(t.id,label,1)} className="rounded border bg-white px-3 py-1 disabled:opacity-30">↓</button>
            </li>)}</ol>}
          </div>
        </div>}
      </section>)}
  </div></main>;
}
