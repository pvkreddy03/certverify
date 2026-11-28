import {test} from "node:test";
import assert from "node:assert/strict";
import {calculateStandard,STANDARD_FIELDS,applies} from "../lib/valuation/standard";
import {referenceRate} from "../lib/geo/reference-rate";
test("open plot ignores any stale building amounts and uses adopted site area",()=>{
 const result=calculateStandard("Open plot",{"Adopted land area (sq yd)":"200","Adopted land rate (INR/sq yd)":"35000","Adopted building area (sq ft)":"2000","Construction rate (INR/sq ft)":"2000","Extra items amount (INR)":"10000"});
 assert.equal(result["Fair market value (INR)"],"7000000");
 assert.equal(result["Net construction valuation amount (INR)"],"N/A");
 assert.equal(applies(STANDARD_FIELDS.find(f=>f.name==="Construction rate (INR/sq ft)")!,"Open plot"),false);
});
test("flat uses UDS, adopted area and depreciated building cost",()=>{
 const result=calculateStandard("Apartment / flat",{"Undivided share (UDS) (sq yd)":"40","Adopted land rate (INR/sq yd)":"50000","Adopted building area (sq ft)":"1000","Construction rate (INR/sq ft)":"2000","Depreciation (%)":"10"});
 assert.equal(result["Land value (INR)"],"2000000");
 assert.equal(result["Net construction valuation amount (INR)"],"1800000");
 assert.equal(result["Combined flat rate (INR/sq ft)"],"3800");
});
test("map shows recorded land and combined flat unit rates, never total price",()=>{
 const base={template_name:"Standard Land & Building Valuation (v1)",price_per_sq_meter:null};
 assert.equal(referenceRate({...base,valuation_metrics:[{name:"Property value basis",value:"Open plot"},{name:"Adopted land rate (INR/sq yd)",value:"35000"}]})?.amount,35000);
 assert.equal(referenceRate({...base,valuation_metrics:[{name:"Property value basis",value:"Apartment / flat"},{name:"Construction rate (INR/sq ft)",value:"2000"},{name:"Combined flat rate (INR/sq ft)",value:"3800"}]})?.amount,3800);
 assert.equal(referenceRate({...base,template_name:"Flat",valuation_metrics:[{name:"Fair market value",value:"4500000"},{name:"Construction rate (INR/sq ft)",value:"2000"}]}),null);
 assert.equal(referenceRate({...base,template_name:"Unknown",valuation_metrics:[{name:"Rate",value:"35000"}]}),null);
});
