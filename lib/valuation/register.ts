// Internal valuation-register display uses *snapshotted field labels*, never
// field positions or guesses about values. These exact aliases are conservative.
const GROUPS = [
  ["property owner","property owner name","name of property owner","name of the property owner","owner name","name of owner","owner of property"],
  ["property location","location","site location","property address","address of property","address of the property","site address"],
  ["purpose","purpose of valuation","valuation purpose","purpose of the valuation"],
  ["client name","name of client","name of the client","client"],
  ["bank name","name of bank","name of the bank","lending bank"],
  ["branch","branch name","bank branch","bank branch name"],
  ["survey number","survey no","survey no.","sy no","survey no / plot no"],
] as const;

export function normalizeFieldLabel(label:string) {
  return label.toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
}

export function suggestedDisplayFields(labels:string[]):string[] {
  const normalized=labels.map(label=>normalizeFieldLabel(label));
  const picks:string[]=[];
  for(const group of GROUPS) {
    const matches=labels.filter((_,i)=>group.some(alias=>normalizeFieldLabel(alias)===normalized[i]));
    // Duplicate/ambiguous labels must never silently map to a semantic role.
    if(matches.length===1 && !picks.includes(matches[0])) picks.push(matches[0]);
  }
  return picks.slice(0,8);
}
export type SavedField = {
  certificate_id:string;
  field_name:string;
  field_value:string|null;
  field_type?:string;
  is_public?:boolean;
  display_order?:number;
};

export function snapshotField(snapshots:SavedField[], selectedName:string):SavedField|null {
  const target=normalizeFieldLabel(selectedName);
  const matches=snapshots.filter(field=>normalizeFieldLabel(field.field_name)===target);
  return matches.length===1 ? matches[0] : null;
}
export function paymentLabel(fee:number|null|undefined,received:number|null|undefined) {
  if(fee==null) return "Not recorded";
  if((received??0)>=fee) return "Paid";
  if((received??0)>0) return "Partially paid";
  return "Pending";
}
export function formatRupees(value:number) {
  return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(value);
}
