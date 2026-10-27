import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCertificateExportSheets, packageCertificateExport, parseExportDates, type ExportCertificate, type ExportValue } from "../lib/certificates/export-workbook";
import { readXlsxSheets } from "../lib/bulk/xlsx";

const creator = "00000000-0000-0000-0000-000000000001";
function cert(id: string, templateId: string | null, templateName: string | null, time="2026-10-27T05:00:00Z"): ExportCertificate {
  return { id, template_id: templateId, template_name: templateName,
    certificate_id: "CV-2026-" + id, public_verification_id: id,
    status: id === "02" ? "Revoked" : "Active", created_at: time, user_id: creator };
}
function value(id: string, name: string, text: string, order=1):ExportValue {
  return { certificate_id: id, field_name: name, field_type: "text", field_value: text, display_order: order };
}
test("export groups records into one worksheet per template with original values and status",()=>{
  const records=[
    cert("01","a","Land & Building"),
    cert("02","b","Clinical/Test"),
    cert("03","a","Land & Building"),
  ];
  const values=[value("01","Property Owner","Alice"),value("03","Property Owner","Bob"),
    value("01","Fair Value","120000",2),value("02","Sample","<hemoglobin>& =3+2")];
  const sheets=buildCertificateExportSheets(records,values,new Map([[creator,"valuer@example.test"]]),id=>"https://certverify.example/verify/"+id);
  assert.equal(sheets.length,2);
  assert.equal(sheets[0].name,"Land & Building");
  assert.equal(sheets[1].name,"Clinical Test");
  assert.ok(sheets[0].headers.includes("Property Owner"));
  assert.ok(sheets[0].headers.includes("Fair Value"));
  assert.ok(!sheets[1].headers.includes("Property Owner"));
  assert.equal(sheets[0].rows.length,2);
  assert.equal(sheets[0].rows[0][3],"val uer@example.test".replace(" ",""));
  assert.equal(sheets[0].rows[0][4],"https://certverify.example/verify/01");
  assert.equal(sheets[1].rows[0][1],"Revoked");
  const workbook=packageCertificateExport(sheets);
  assert.equal(workbook.extension,"xlsx");
  const roundTrip=readXlsxSheets(workbook.bytes);
  assert.equal(roundTrip.length,2);
  assert.equal(roundTrip[1].rows[0].at(-1),"<hemoglobin>& =3+2");
});
test("historical template names do not split a template and sheet titles never collide",()=>{
  const sheets=buildCertificateExportSheets([
    cert("11","a","Old:Valuation"),
    cert("12","a","Renamed:Valuation"),
    cert("13","b","Old/Valuation"),
    cert("14",null,null),
  ],[],new Map(),x=>x);
  assert.equal(sheets.length,3);
  assert.equal(sheets[0].rows.length,2);
  assert.equal(sheets[0].name,"Old Valuation");
  assert.equal(sheets[1].name,"Old Valuation (2)");
  assert.equal(sheets[2].name,"No template");
});
test("multiple template groups over XLSX sheet capacity produce ZIP of separate workbooks",()=>{
  const records=Array.from({length:31},(_,i)=>cert(String(i),String(i),"Template "+i));
  const sheets=buildCertificateExportSheets(records,[],new Map(),x=>x);
  const data=packageCertificateExport(sheets);
  assert.equal(data.extension,"zip");
  assert.equal(data.bytes.readUInt32LE(0),0x04034b50);
  assert.ok(data.bytes.includes(Buffer.from("certificates-part-002.xlsx")));
});
test("date filters are inclusive calendar dates in IST and validate order",()=>{
  const d=parseExportDates("2026-10-01","2026-10-27");
  assert.equal(d.begin,"2026-09-30T18:30:00.000Z");
  assert.equal(d.after,"2026-10-27T18:30:00.000Z");
  assert.deepEqual(parseExportDates("",""),{begin:null,after:null,from:null,to:null});
  assert.throws(()=>parseExportDates("2026-02-30","2026-03-02"));
  assert.throws(()=>parseExportDates("2026-10-28","2026-10-27"));
});
test("formula-looking values stay literal inline string cells without embedded Excel formulas",()=>{
  const sheet=buildCertificateExportSheets([cert("xy","t","Source")],
    [value("xy","Input","=HYPERLINK(\"https://example.com\",\"click\")")],new Map(),x=>x);
  const xlsx=packageCertificateExport(sheet).bytes;
  assert.ok(xlsx.includes(Buffer.from("=HYPERLINK(")));
  assert.ok(!xlsx.includes(Buffer.from("<f>")));
});
