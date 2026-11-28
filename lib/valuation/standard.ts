export const STANDARD_TEMPLATE = "Standard Land & Building Valuation (v1)";
export const STANDARD_DESCRIPTION = "ValuerSeal standard valuation form v1";
export const PROPERTY_TYPES = ["Open plot","Independent house","Villa","Apartment / flat","Commercial building","Industrial building","Agricultural land"] as const;
export type PropertyType = typeof PROPERTY_TYPES[number];
type Field = {name:string;group:string;type:"text"|"number"|"date"|"location";applies?:"land"|"building"|"flat"|"villa"|"built-land";required?:boolean;multiline?:boolean};
const f=(group:string,name:string,type:Field["type"]="text",applies?:Field["applies"],required=false,multiline=false):Field=>({name,group,type,applies,required,multiline});
export const STANDARD_FIELDS:Field[]=[
 f("I. General","Property value basis","text",undefined,true),
 f("I. General","Client / bank / branch","text",undefined,true),
 f("I. General","Reference number"),f("I. General","Purpose of valuation","text",undefined,true),
 f("I. General","Date of appointment","date"),f("I. General","Date of inspection","date",undefined,true),
 f("I. General","Date of valuation","date",undefined,true),f("I. General","Date of report","date",undefined,true),
 f("I. General","Owner name","text",undefined,true),f("I. General","Seller / purchaser / joint ownership details","text",undefined,false,true),
 f("I. General","Documents produced for perusal","text",undefined,true,true),
 f("I. General","Property address","text",undefined,true,true),f("I. General","Map location","location",undefined,true),
 f("I. General","Survey / plot / door / flat number"),f("I. General","Village / ward / mandal / district / PIN"),
 f("I. General","Description and nearby landmarks","text",undefined,false,true),
 f("I. General","Mortgage and prohibited property details / legal opinion"),f("I. General","Occupancy and monthly rent"),
 f("II. Site characteristics","Classification and development of locality"),f("II. Site characteristics","Topography, shape and permitted use"),
 f("II. Site characteristics","Approach road width, type and access"),f("II. Site characteristics","Layout / planning approval and authority"),
 f("II. Site characteristics","Utilities and civic amenities"),f("II. Site characteristics","Flooding, restrictions and acquisition risk"),
 f("II. Site characteristics","Boundaries as per documents (N / S / E / W)","text",undefined,false,true),
 f("II. Site characteristics","Boundaries as inspected (N / S / E / W)","text",undefined,false,true),
 f("II. Site characteristics","Dimensions as per documents (N / S / E / W)","text",undefined,false,true),
 f("II. Site characteristics","Dimensions as inspected (N / S / E / W)","text",undefined,false,true),
 f("A. Land valuation","Document land area (sq yd)","number","land"),f("A. Land valuation","Actual land area (sq yd)","number","land"),
 f("A. Land valuation","Road affected area (sq yd)","number","land"),f("A. Land valuation","Adopted land area (sq yd)","number","land",true),
 f("A. Land valuation","Undivided share (UDS) (sq yd)","number","villa"),f("A. Land valuation","UDS basis / title details","text","villa"),
 f("A. Land valuation","Adopted land rate (INR/sq yd)","number",undefined,true),
 f("A. Land valuation","Guideline land rate (INR/sq yd)","number"),
 f("A. Land valuation","Comparable evidence and market range","text",undefined,false,true),
 f("B. Building valuation","Construction type and use","text","building"),f("B. Building valuation","Year of construction","number","building"),
 f("B. Building valuation","Age / total life / residual life (years)","text","building"),
 f("B. Building valuation","Floors and heights / flat floor","text","building"),
 f("B. Building valuation","Sanctioned / actual area and deviations","text","building",false,true),
 f("B. Building valuation","Carpet area (sq ft)","number","building"),f("B. Building valuation","Built-up area (sq ft)","number","building"),
 f("B. Building valuation","Super built-up area (sq ft)","number","flat"),
 f("B. Building valuation","Adopted building area (sq ft)","number","building",true),
 f("B. Building valuation","Building area basis","text","building",true),
 f("B. Building valuation","Approved plan authority / date / authenticity","text","building"),
 f("B. Building valuation","Condition and construction specifications","text","building",false,true),
 f("B. Building valuation","Construction rate (INR/sq ft)","number","building",true),
 f("B. Building valuation","Depreciation (%)","number","building",true),
 f("C-F. Extra items, amenities, miscellaneous and services","Extra items amount (INR)","number","building"),
 f("C-F. Extra items, amenities, miscellaneous and services","Amenities amount (INR)","number","building"),
 f("C-F. Extra items, amenities, miscellaneous and services","Miscellaneous amount (INR)","number"),
 f("C-F. Extra items, amenities, miscellaneous and services","Services amount (INR)","number"),
 f("C-F. Extra items, amenities, miscellaneous and services","Details of additional items and services","text",undefined,false,true),
 f("Valuation conclusion","Guideline value (INR)","number"),f("Valuation conclusion","Realizable value (INR)","number"),
 f("Valuation conclusion","Distress value (INR)","number"),f("Valuation conclusion","Method adopted and justification","text",undefined,true,true),
 f("Valuation conclusion","Saleability, rental / income potential and market evidence","text",undefined,false,true),
 f("Valuation conclusion","Assumptions, limitations, departures and intended users","text",undefined,true,true),
 f("Declaration and annexures","Valuer name and registration","text",undefined,true),
 f("Declaration and annexures","Independence / conflict disclosure and inspection statement","text",undefined,true,true),
 f("Declaration and annexures","Supporting documents / photo / map annexure references","text",undefined,false,true),
 f("Declaration and annexures","Place of report")
];
export const CALCULATED_FIELDS=["Fair market value (INR)","Land value (INR)","Net construction value (INR)","Combined flat rate (INR/sq ft)","Replacement cost (INR)","Depreciation amount (INR)"];
export const isStandard=(name:string|null|undefined)=>name===STANDARD_TEMPLATE;
export function applies(field:Field,type:PropertyType){
 const open=type==="Open plot"||type==="Agricultural land";
 if(field.applies==="building")return !open;
 if(field.applies==="flat")return type==="Apartment / flat";
 if(field.applies==="villa")return type==="Villa"||type==="Apartment / flat";
 if(field.applies==="land")return type!=="Apartment / flat";
 if(field.applies==="built-land")return !open&&type!=="Apartment / flat";
 return true;
}
export function calculateStandard(type:PropertyType,values:Record<string,string>){
 const n=(name:string)=>Number(values[name]||0);
 const open=type==="Open plot"||type==="Agricultural land";
 const flat=type==="Apartment / flat";
 const landArea=flat?n("Undivided share (UDS) (sq yd)"):n("Adopted land area (sq yd)");
 const land=landArea*n("Adopted land rate (INR/sq yd)");
 const area=open?0:n("Adopted building area (sq ft)");
 const replacement=area*n("Construction rate (INR/sq ft)");
 const depreciation=replacement*n("Depreciation (%)")/100;
 const construction=replacement-depreciation;
 const extras=["Extra items amount (INR)","Amenities amount (INR)","Miscellaneous amount (INR)","Services amount (INR)"].reduce((s,name)=>s+n(name),0);
 const total=land+construction+extras;
 const round=(value:number)=>String(Math.round(value*100)/100);
 return {"Fair market value (INR)":round(total),"Land value (INR)":round(land),"Net construction value (INR)":open?"N/A":round(construction),"Combined flat rate (INR/sq ft)":flat&&area>0?round((land+construction)/area):"N/A","Replacement cost (INR)":open?"N/A":round(replacement),"Depreciation amount (INR)":open?"N/A":round(depreciation)};
}
export function validateStandard(type:PropertyType,values:Record<string,string>){
 for(const field of STANDARD_FIELDS){
  if(!applies(field,type)||field.name==="Property value basis")continue;
  const value=values[field.name]?.trim()||"";
  if(field.required&&!value)throw new Error("Required: "+field.name);
  if(field.type==="number"&&value&&(!Number.isFinite(Number(value))||Number(value)<0))throw new Error("Enter a valid non-negative number: "+field.name);
 }
 if(type==="Apartment / flat"&&!(Number(values["Undivided share (UDS) (sq yd)"])>0))throw new Error("Enter the verified undivided share for a flat.");
 if(type!=="Apartment / flat"&&!(Number(values["Adopted land area (sq yd)"])>0))throw new Error("Adopted land area must be positive.");
 if(!(Number(values["Adopted land rate (INR/sq yd)"])>0))throw new Error("Land rate must be positive.");
 if(applies(STANDARD_FIELDS.find(field=>field.name==="Adopted building area (sq ft)")!,type)&&!(Number(values["Adopted building area (sq ft)"])>0))throw new Error("Building area must be positive.");
 if(Number(values["Depreciation (%)"]||0)>100)throw new Error("Depreciation cannot exceed 100%.");
}
