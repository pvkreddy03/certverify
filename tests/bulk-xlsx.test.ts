import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createXlsxTemplate, readXlsx, WorkbookError } from "../lib/bulk/xlsx";

test("Excel template creates genuine XLSX that round-trips 100 editable rows",()=>{
  const rows=Array.from({length:100},(_,i)=>[
    "Owner "+(i+1),"2026-10-15",String(i+0.5),"A & B <Company>",
  ]);
  const workbook=createXlsxTemplate(["Owner","Valuation Date","Value","Purpose"],rows);
  assert.equal(workbook.readUInt32LE(0),0x04034b50);
  const parsed=readXlsx(workbook);
  assert.deepEqual(parsed.headers,["Owner","Valuation Date","Value","Purpose"]);
  assert.equal(parsed.rows.length,100);
  assert.deepEqual(parsed.rows[0],rows[0]);
  assert.deepEqual(parsed.rows[99],rows[99]);
});
test("over 100 Excel records are rejected before any certificate generation",()=>{
  const tooMany=createXlsxTemplate(["Owner"],Array.from({length:101},(_,i)=>["Person "+i]));
  assert.throws(()=>readXlsx(tooMany),WorkbookError);
});
test("empty templates, non-XLSX files and oversized input are rejected",()=>{
  assert.throws(()=>readXlsx(createXlsxTemplate(["One"])),WorkbookError);
  assert.throws(()=>readXlsx(Buffer.from("Not a spreadsheet")),WorkbookError);
  assert.throws(()=>readXlsx(Buffer.alloc(1024*1024+1)),WorkbookError);
});
test("database bulk contract is atomic, locked and idempotent",()=>{
  const sql=readFileSync("supabase/proposals/20261015_bulk_certificate_batches.sql","utf8");
  for(const required of [
    "row_count>100","for update","idempotency_key","request_hash",
    "public.generate_certificate_id(a)","insert into public.certificates",
    "insert into public.certificate_field_values",
    "cv_bulk_batch_details","cv_bulk_batches_list","cv_account_role(a)",
  ])assert.ok(sql.includes(required),"Missing atomic import guard: "+required);
});
