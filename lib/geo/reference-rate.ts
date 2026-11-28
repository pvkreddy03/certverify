type Metric={name:string;value:string};
export type ReferenceRateRecord={template_name:string|null;price_per_sq_meter:number|null;valuation_metrics?:Metric[]};
export type ReferenceRate={amount:number;unit:"sq yd"|"sq ft";basis:string};
const normalize=(value:string)=>value.toLowerCase().replace(/₹|rs\.?|inr/g,"").replace(/square/g,"sq").replace(/yards?/g,"yd").replace(/feet|foot/g,"ft").replace(/metres?|meters?/g,"m").replace(/[^a-z0-9]+/g," ").trim();
function readNumber(value:string){
 const cleaned=value.trim().replace(/^(?:₹|rs\.?|inr)\s*/i,"").replace(/,/g,"");
 if(!/^\d+(?:\.\d+)?(?:\s*(?:\/|per)\s*(?:sq\.?\s*(?:yds?|yards?|ft|feet|foot|m|metres?|meters?)))?\s*$/i.test(cleaned))return null;
 const result=Number.parseFloat(cleaned);return Number.isFinite(result)&&result>0?result:null;
}
export function referenceRate(record:ReferenceRateRecord):ReferenceRate|null{
 const metrics=record.valuation_metrics??[];
 const type=normalize(metrics.find(m=>normalize(m.name)==="property value basis")?.value??record.template_name??"");
 const flat=/\b(flat|apartment)\b/.test(type);
 const land=/\b(open plot|open land|vacant plot|vacant land|residential plot|agricultural land|land only|plot valuation)\b/.test(type)||type==="plot";
 const wanted=flat?"sq ft":land?"sq yd":null;
 if(!wanted)return null;
 // Never turn total property value or construction-only rate into a comparable.
 const candidates=metrics.filter(m=>{
  const name=normalize(m.name);
  if(!/\b(rate|price)\b/.test(name)||/\b(guideline|registration|government|distress|construction|replacement|range|minimum|maximum)\b/.test(name))return false;
  if(flat)return /\b(combined|composite|flat|apartment|market|adopted)\b/.test(name)&&!/\bland\b/.test(name)||/\b(land and building|land plus building|land and construction)\b/.test(name);
  return !/\b(building|flat|apartment|composite|combined)\b/.test(name);
 });
 for(const metric of candidates){
  const unit=normalize(metric.name+" "+metric.value);
  const amount=readNumber(metric.value);
  if(amount===null)continue;
  if(wanted==="sq yd"&&/\bsq yd(s)?\b/.test(unit))return {amount,unit:wanted,basis:"Adopted land rate"};
  if(wanted==="sq ft"&&/\bsq ft\b/.test(unit))return {amount,unit:wanted,basis:"Recorded combined flat rate"};
  if(wanted==="sq yd"&&/\bsq m\b/.test(unit))return {amount:amount*0.83612736,unit:wanted,basis:"Land rate converted from sq m"};
 }
 // A legacy generic sq metre value is not a verified combined flat rate.
 if(land&&typeof record.price_per_sq_meter==="number"&&record.price_per_sq_meter>0)return {amount:record.price_per_sq_meter*0.83612736,unit:"sq yd",basis:"Recorded land rate converted from sq m"};
 return null;
}
export function referenceRateLabel(record:ReferenceRateRecord){
 const rate=referenceRate(record);
 return rate?"₹"+rate.amount.toLocaleString("en-IN",{maximumFractionDigits:2})+" / "+rate.unit:"Rate not recorded";
}
