import {test} from "node:test";
import assert from "node:assert/strict";
import {valuationAgeBand,valuationAgeInfo,VALUATION_AGE_LEGEND} from "../lib/geo/valuation-age";

const asOf=new Date(2026,9,29,12,0,0);
test("valuation pins use four calendar-age colours at exact anniversaries",()=>{
  assert.equal(valuationAgeBand("2026-10-29",asOf),"under-6-months");
  assert.equal(valuationAgeBand("2026-04-30",asOf),"under-6-months");
  assert.equal(valuationAgeBand("2026-04-29",asOf),"6-to-12-months");
  assert.equal(valuationAgeBand("2025-10-30",asOf),"6-to-12-months");
  assert.equal(valuationAgeBand("2025-10-29",asOf),"1-to-2-years");
  assert.equal(valuationAgeBand("2024-10-29",asOf),"1-to-2-years");
  assert.equal(valuationAgeBand("2024-10-28",asOf),"over-2-years");
  assert.equal(valuationAgeBand("2019-05-01",asOf),"over-2-years");
});
test("missing, invalid and future dates are neutral, not falsely fresh",()=>{
  for(const value of [null,undefined,"","2026-02-30","2027-01-01","29-10-2026","2026-10-29T00:00:00Z"]){
    assert.equal(valuationAgeBand(value,asOf),"unknown",String(value));
  }
});
test("monthly thresholds work through leap days and month-end",()=>{
  const march31=new Date(2026,2,31,12);
  assert.equal(valuationAgeBand("2025-09-30",march31),"6-to-12-months");
  assert.equal(valuationAgeBand("2025-10-01",march31),"under-6-months");
  const leap=new Date(2024,7,31,12);
  assert.equal(valuationAgeBand("2024-02-29",leap),"6-to-12-months");
  assert.equal(valuationAgeBand("2024-03-01",leap),"under-6-months");
});
test("age legend is complete, colour-coded and remains distinct for unknown dates",()=>{
  assert.equal(VALUATION_AGE_LEGEND.length,5);
  assert.equal(valuationAgeInfo("under-6-months").color,"#15803d");
  assert.equal(valuationAgeInfo("6-to-12-months").color,"#eab308");
  assert.equal(valuationAgeInfo("1-to-2-years").color,"#f97316");
  assert.equal(valuationAgeInfo("over-2-years").color,"#dc2626");
  assert.equal(new Set(VALUATION_AGE_LEGEND.map(item=>item.color)).size,5);
  for(const item of VALUATION_AGE_LEGEND){
    assert.equal(valuationAgeInfo(item.key).color,item.color);
  }
});
