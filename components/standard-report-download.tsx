"use client";
import {useRef,useState} from "react";
import {packageWordParts,downloadReport} from "@/lib/reports/docx-visual";
import {STANDARD_FIELDS,CALCULATED_FIELDS} from "@/lib/valuation/standard";
import {parseGeoLocation} from "@/lib/geo/location";

type FieldValue={field_name:string;field_value:string|null};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]??c)).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"");
const p=(value:string,bold=false,size=22)=>'<w:p><w:pPr><w:spacing w:after="100"/></w:pPr><w:r><w:rPr>'+(bold?'<w:b/>':'')+'<w:sz w:val="'+size+'"/></w:rPr>'+value.split(/\r?\n/).map((line,index)=>(index?'<w:br/>':'')+'<w:t xml:space="preserve">'+escape(line)+'</w:t>').join("")+'</w:r></w:p>';
const heading=(value:string)=>p(value,true,28);
const pageBreak='<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
const cell=(value:string,width:number,bold=false)=>'<w:tc><w:tcPr><w:tcW w:w="'+width+'" w:type="dxa"/></w:tcPr>'+p(value,bold)+'</w:tc>';
const table=(rows:[string,string][])=>'<w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders>'+["top","left","bottom","right","insideH","insideV"].map(side=>'<w:'+side+' w:val="single" w:sz="4" w:color="B0BCC8"/>').join("")+'</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="4200"/><w:gridCol w:w="5400"/></w:tblGrid>'+rows.map(([name,value])=>'<w:tr><w:trPr><w:cantSplit/></w:trPr>'+cell(name,4200,true)+cell(value,5400)+'</w:tr>').join("")+'</w:tbl>';
function createReport(number:string,fields:FieldValue[]){
 const values=new Map(fields.map(field=>[field.field_name,field.field_value??""]));
 const value=(name:string)=>{
  const v=values.get(name)||"";
  if(!v)return "Not recorded";
  if(v==="N/A")return v;
  if(name==="Map location"){const loc=parseGeoLocation(v);return loc?loc.lat+", "+loc.lng+(loc.label?" ("+loc.label+")":""):v;}
  if(/\(INR(?:\/[^)]*)?\)$/.test(name)&&Number.isFinite(Number(v)))return "INR "+Number(v).toLocaleString("en-IN",{maximumFractionDigits:2});
  return v;
 };
 const rows=(names:string[]):[string,string][]=>names.map(name=>[name==="Property value basis"?"Property type":name,value(name)]);
 const sections=Array.from(new Set(STANDARD_FIELDS.map(field=>field.group)));
 const summary=["Fair market value (INR)","Land value (INR)","Net construction value (INR)","Replacement cost (INR)","Depreciation amount (INR)","Combined flat rate (INR/sq ft)","Guideline value (INR)","Realizable value (INR)","Distress value (INR)"];
 let body=heading("VALUATION REPORT — LAND & BUILDING")+p("ValuerSeal record: "+number)+table(rows(["Reference number","Client / bank / branch","Owner name","Property value basis","Property address","Purpose of valuation","Date of inspection","Date of valuation","Date of report","Fair market value (INR)"]))+pageBreak;
 for(const section of sections){
  body+=heading(section)+table(rows(STANDARD_FIELDS.filter(field=>field.group===section).map(field=>field.name)));
  if(section==="B. Building valuation")body+=table(rows(["Replacement cost (INR)","Depreciation amount (INR)","Net construction value (INR)"]));
  if(section==="A. Land valuation")body+=table(rows(["Land value (INR)"]));
  if(section==="Valuation conclusion")body+=heading("Abstract of valuation")+table(rows(summary));
 }
 body+=p("Signature and official seal of the valuer: ______________________",true)+p("This general-purpose format must be reviewed and signed by the responsible valuer. Check institution-specific requirements and attach applicable evidence and annexures before issue.");
 const doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1153" w:bottom="1000" w:left="1153"/></w:sectPr></w:body></w:document>';
 const parts=[
  ["[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
  ["_rels/.rels",'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
  ["word/document.xml",doc]
 ];
 return packageWordParts(parts.map(([name,xml])=>({name,bytes:new TextEncoder().encode(xml)})));
}
export function StandardReportDownload({certificateNumber,fieldValues}:{certificateNumber:string;fieldValues:FieldValue[]}){
 const lock=useRef(false);
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const complete=CALCULATED_FIELDS.every(name=>fieldValues.some(field=>field.field_name===name&&field.field_value!==null));
 function download(){
  if(lock.current||!complete)return;
  lock.current=true;setBusy(true);setMessage("");
  try{downloadReport(createReport(certificateNumber,fieldValues),"Valuation-"+certificateNumber+".docx");setMessage("Word report prepared. Review and sign before issuing.");}
  catch(e){setMessage(e instanceof Error?e.message:"Could not generate the report.");}
  finally{lock.current=false;setBusy(false);}
 }
 return <section className="cv-panel p-5"><h2 className="text-lg font-bold">Standard Land &amp; Building Report</h2><p className="mt-1 text-sm text-slate-600">Editable Word report from the saved valuation, with the same figures on the cover and calculation pages.</p><button type="button" className="cv-primary mt-4 disabled:opacity-50" disabled={busy||!complete} onClick={download}>{busy?"Preparing…":"Download Word Report"}</button>{!complete&&<p className="mt-2 text-sm text-amber-800">This record is incomplete. Review its saved fields before issuing a report.</p>}{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</section>;
}
