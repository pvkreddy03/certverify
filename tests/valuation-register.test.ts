import test from "node:test";
import assert from "node:assert/strict";
import {normalizeFieldLabel,suggestedDisplayFields,snapshotField,paymentLabel} from "../lib/valuation/register";

test("valuation register does not guess that a client or agent is a property owner",()=>{
  const labels=["Agent / DSA Name","Price per Sq Meter","Name of the client","Survey Number","Purpose"];
  assert.deepEqual(suggestedDisplayFields(labels),["Purpose","Name of the client","Survey Number"]);
  assert.equal(suggestedDisplayFields(["Applicant","Agent","Other person"]).length,0);
});
test("field positions never determine which saved value appears",()=>{
  const values=[
    {certificate_id:"case-1",field_name:"Purpose",field_value:"Bank loan"},
    {certificate_id:"case-1",field_name:"Survey Number",field_value:"123"},
    {certificate_id:"case-1",field_name:"PROPERTY OWNER",field_value:"Owner A"},
  ];
  assert.equal(snapshotField(values,"property owner")?.field_value,"Owner A");
  assert.equal(snapshotField([...values].reverse(),"property owner")?.field_value,"Owner A");
  assert.equal(snapshotField(values,"Client Name"),null);
  assert.equal(normalizeFieldLabel("  Survey-No.  "),"survey no");
});
test("duplicates and ambiguous field labels never misrepresent a valuation",()=>{
  const rows=[
    {certificate_id:"case-1",field_name:"Owner Name",field_value:"A"},
    {certificate_id:"case-1",field_name:"Owner-Name",field_value:"B"},
  ];
  assert.equal(snapshotField(rows,"Owner Name"),null);
  assert.deepEqual(suggestedDisplayFields(["Owner Name","Owner-Name"]),[]);
});
test("job fee status comes only from the private ledger",()=>{
  assert.equal(paymentLabel(null,null),"Not recorded");
  assert.equal(paymentLabel(2000,0),"Pending");
  assert.equal(paymentLabel(2000,500),"Partially paid");
  assert.equal(paymentLabel(2000,2000),"Paid");
});
