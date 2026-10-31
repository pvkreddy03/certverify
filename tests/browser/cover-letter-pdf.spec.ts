import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { readFile } from "node:fs/promises";

const account="10000000-0000-0000-0000-000000000001";
const template="41000000-0000-0000-0000-000000000001";
const certificate="20000000-0000-0000-0000-000000000001";
const verify="30000000-0000-0000-0000-000000000001";
const wordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// A real ZIP-formatted OOXML fixture with an ordinary paragraph and a table.
function sampleDocx() {
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="' + wordNs + '"><w:body>' +
    '<w:p><w:r><w:t>VALUATION REPORT</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t xml:space="preserve">Client: John Smith</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Applicant</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:p><w:r><w:t>John Smith</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:sectPr/></w:body></w:document>';
  const files = [
    { name: "[Content_Types].xml", data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: "_rels/.rels", data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: "word/document.xml", data: Buffer.from(xml) },
  ];
  let offset = 0;
  const local: Buffer[] = [], central: Buffer[] = [];
  for (const f of files) {
    const name = Buffer.from(f.name), crc = crc32(f.data);
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(f.data.length, 18); header.writeUInt32LE(f.data.length, 22);
    header.writeUInt16LE(name.length, 26); name.copy(header, 30);
    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(f.data.length, 20);
    record.writeUInt32LE(f.data.length, 24); record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42); name.copy(record, 46);
    local.push(header, f.data); central.push(record);
    offset += header.length + f.data.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}



async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
}
async function mockRecords(page: Page) {
  await page.route("**/rest/v1/certificates*", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify([{
      id: certificate, certificate_id:"CV-2026-001", public_verification_id:verify,
      template_id:template, template_name:"Property Valuation", report_format_id:null,
      status:"Active", created_at:"2026-10-31T00:00:00Z"
    }]),
  }));
  await page.route("**/rest/v1/certificate_templates*", route => route.fulfill({
    status:200,contentType:"application/json",body:JSON.stringify([{id:template,name:"Property Valuation",account_id:account}]),
  }));
  await page.route("**/rest/v1/certificate_field_values*", route => route.fulfill({
    status:200,contentType:"application/json",body:JSON.stringify([
      {field_name:"Property Address",field_value:"Bhongir, Telangana"},
      {field_name:"Client Name",field_value:"Example Customer"},
    ]),
  }));
}
async function samplePdf() {
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([595.28,841.89]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("ORIGINAL LETTERHEAD", {x:100,y:780,size:18,font});
  return Buffer.from(await pdf.save());
}

test.beforeEach(async ({request}) => {await request.post("http://127.0.0.1:54329/test/reset");});

test("upload native PDF, position QR by click and generate QR-only printable PDF", async ({page}) => {
  await mockRecords(page);
  await login(page);
  await page.goto("/dashboard/cover-letters");
  await expect(page.getByRole("heading", {name:"Cover Letter Format Designer"})).toBeVisible();
  await page.getByPlaceholder("Standard cover letter").fill("Standard Valuation Cover");
  await page.locator('input[type=file]').setInputFiles({
    name:"letterhead.pdf", mimeType:"application/pdf", buffer:await samplePdf(),
  });
  await expect(page.getByText("Document ready.", {exact:false})).toBeVisible({timeout:30000});
  const paper=page.getByRole("button",{name:"Click or drag to set QR or text position"});
  await expect(paper).toBeVisible();
  await paper.click({position:{x:70,y:140}});
  await page.getByRole("button",{name:/Example cover-letter text/}).click();
  await expect(page.getByText("original letterhead and QR", {exact:false})).toBeVisible();
  await page.getByRole("button",{name:"Preview PDF"}).click();
  await expect(page.getByRole("link",{name:"Open PDF to print"})).toBeVisible({timeout:30000});
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download PDF"}).click();
  const file=await download;
  expect(file.suggestedFilename()).toMatch(/Cover Letter.*CV-2026-001\.pdf$/);
});

test("manually type a letter in the same PDF upload workflow", async ({page}) => {
  await mockRecords(page);await login(page);
  await page.goto("/dashboard/cover-letters");
  await page.locator('input[type=file]').setInputFiles({
    name:"letterhead.pdf",mimeType:"application/pdf",buffer:await samplePdf()
  });
  await expect(page.getByText("Document ready.",{exact:false})).toBeVisible({timeout:30000});
  await page.getByRole("textbox",{name:"Example cover-letter text"}).fill("To the Branch Manager\nSubject: Valuation report\nPlease find attached the report.");
  await page.getByRole("button",{name:"Preview PDF"}).click();
  await expect(page.getByRole("link",{name:"Open PDF to print"})).toBeVisible({timeout:30000});
});

test("Word DOCX upload, certificate autofill and optional merged Word report", async ({ page }) => {
  await mockRecords(page);
  await page.route("**/rest/v1/cv_report_format_library*", route => route.fulfill({
    status:200,contentType:"application/json",
    body:JSON.stringify([{id:"55000000-0000-0000-0000-000000000001",
      template_id:template,format_name:"Bank Valuation Report",
      storage_path:account+"/"+template+"/55000000-0000-0000-0000-000000000001/01234567-1234-1234-1234-123456789012.docx",
      bindings:[]}]),
  }));
  await page.route("**/storage/v1/object/**", route => route.fulfill({
    status:200,contentType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    body:sampleDocx(),
  }));
  await login(page);
  await page.goto("/dashboard/cover-letters");
  await page.locator('input[type=file]').setInputFiles({
    name:"letterhead.docx",
    mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer:sampleDocx(),
  });
  await expect(page.getByText("Document ready.",{exact:false})).toBeVisible({timeout:30000});
  await page.getByRole("button",{name:"Format auto-fill and report linking (optional)"}).click();
  await page.getByRole("textbox",{name:"Reusable letter wording"}).fill("Ref {{Certificate Number}}\nProperty {{Property Address}}");
  await expect(page.getByRole("textbox",{name:"Example cover-letter text"})).toHaveValue(/Ref CV-2026-001[\s\S]*Property Bhongir, Telangana/);
  await page.getByRole("checkbox",{name:"Include the Word report after the letter"}).check();
  await page.getByRole("button",{name:"Preview PDF"}).click();
  await expect(page.getByRole("link",{name:"Open PDF to print"})).toBeVisible({timeout:30000});
});


test("certificate details downloads one complete PDF using a report-linked cover format and certificate auto-fill",async ({page})=>{
 const reportId="55000000-0000-0000-0000-000000000001";
 const generalId="74000000-0000-0000-0000-000000000001";
 const linkedId="74000000-0000-0000-0000-000000000002";
 const head=(id:string,name:string,report_format_id:string|null,body_template:string)=>({
   id,name,report_format_id,template_id:report_format_id ? template : null,body_template,
   file_type:"application/pdf",file_name:"letterhead.pdf",storage_path:account+"/"+id+"/72000000-0000-0000-0000-000000000001.pdf",
   qr_x:0.79,qr_y:0.75,qr_size:0.16,text_x:0.13,text_y:0.28,text_width:0.72,text_height:0.42,
 });
 const pdfBytes=await samplePdf();
 let savedCopies=0;
 await page.route("**/rest/v1/certificates*",route=>{
  if(!route.request().url().includes("id=eq.")) return route.continue();
  return route.fulfill({
   status:200,contentType:"application/json",body:JSON.stringify({
     id:certificate,certificate_id:"CV-2026-001",status:"Active",created_at:"2026-10-31T00:00:00Z",
     template_id:template,template_name:"Property Valuation",report_format_id:reportId,
     public_verification_id:verify,revoked_at:null,revoked_by:null,revocation_reason:null,
     public_revocation_reason:null,revocation_previous_status:null,
   }),
 });
 });
 await page.route("**/rest/v1/certificate_field_values*",route=>route.fulfill({
   status:200,contentType:"application/json",body:JSON.stringify([
     {id:"42000000-0000-0000-0000-000000000001",certificate_id:certificate,
       field_name:"Client Name",field_value:"Example Customer",field_type:"text",is_public:true,display_order:1},
   ]),
 }));
 await page.route("**/rest/v1/cv_cover_letter_templates*",route=>route.fulfill({
   status:200,contentType:"application/json",body:JSON.stringify([
     head(generalId,"General Cover",null,""),
     head(linkedId,"Bank Cover",reportId,"To {{Client Name}}\nRef {{Certificate Number}}"),
   ]),
 }));
 await page.route("**/rest/v1/cv_report_format_library*",route=>route.fulfill({
   status:200,contentType:"application/json",body:JSON.stringify([{
     id:reportId,template_id:template,account_id:account,format_name:"Bank Report",
     storage_path:account+"/"+template+"/"+reportId+"/72000000-0000-0000-0000-000000000001.docx",
     bindings:[],file_name:"report.docx",
   }]),
 }));
 await page.route("**/rest/v1/cv_saved_cover_letters*",route=>{
   savedCopies++;return route.fulfill({status:500,contentType:"application/json",body:"{}"});
 });
 await page.route("**/storage/v1/object/**",route=>{
   const isDocx=route.request().url().includes("certverify-word-formats");
   return route.fulfill({status:200,contentType:isDocx?
     "application/vnd.openxmlformats-officedocument.wordprocessingml.document":"application/pdf",
     body:isDocx?sampleDocx():pdfBytes});
 });
 await login(page);
 await page.goto("/dashboard/certificates/"+certificate);
 await expect(page.getByRole("heading",{name:"Download Cover Letter"})).toBeVisible();
 const cover=page.getByRole("combobox",{name:"Cover letter format"});
 await expect(cover).toHaveValue(generalId); // default is plain, not a report-linked template
 await cover.selectOption(linkedId); // optional advanced cover
 await expect(page.getByRole("textbox",{name:"Letter text"})).toHaveValue("To Example Customer\nRef CV-2026-001");
 await expect(page.getByRole("combobox",{name:"Attach report to PDF (optional)"})).toHaveValue(reportId);
 // Word output is a genuine DOCX with a full-page QR letterhead image and editable text.
 const wordEvent=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download Cover Letter (Word)"}).click();
 const wordFile=await wordEvent;
 expect(wordFile.suggestedFilename()).toMatch(/Cover Letter.*CV-2026-001\.docx$/);
 const wordBytes=await readFile(await wordFile.path());
 expect(wordBytes.subarray(0,4).toString("latin1")).toBe("PK\x03\x04");
 expect(wordBytes.includes(Buffer.from("word/header1.xml"))).toBe(true);
 expect(wordBytes.includes(Buffer.from("word/media/letterhead.png"))).toBe(true);
 expect(wordBytes.includes(Buffer.from("To Example Customer"))).toBe(true);

 const download=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download Cover Letter (PDF)"}).click();
 const result=await download;
 const bytes=await readFile(await result.path());
 const document=await PDFDocument.load(bytes);
 expect(document.getPageCount()).toBe(2); // cover page + report printed together
 expect(savedCopies).toBe(0);
 // Closing the text area means plain cover with QR, no separate Plain mode.
 await page.getByRole("button",{name:/Letter text — edit/}).click();
 await expect(page.getByText("Plain letterhead + verification QR")).toBeVisible();
 await page.getByRole("combobox",{name:"Attach report to PDF (optional)"}).selectOption("none");
 await expect(cover).toHaveValue(generalId);
 const plain=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download Cover Letter (PDF)"}).click();
 expect((await PDFDocument.load(await readFile(await (await plain).path()))).getPageCount()).toBe(1);
 expect(savedCopies).toBe(0);
});


test("without any uploaded letterhead, PDF and Word QR cover downloads still work",async ({page})=>{
 const blankCertificate={
   id:certificate,certificate_id:"CV-EMPTY-2026",status:"Active",created_at:"2026-10-31T00:00:00Z",
   template_id:template,template_name:"Property Valuation",report_format_id:null,
   cover_letter_format_id:null,public_verification_id:verify,
 };
 await page.route("**/rest/v1/certificates*",route=>{
   if(!route.request().url().includes("id=eq.")) return route.continue();
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(blankCertificate)});
 });
 await page.route("**/rest/v1/cv_cover_letter_templates*",route=>route.fulfill({
   status:200,contentType:"application/json",body:"[]"
 }));
 await page.route("**/rest/v1/cv_report_format_library*",route=>route.fulfill({
   status:200,contentType:"application/json",body:"[]"
 }));
 await page.route("**/rest/v1/certificate_field_values*",route=>route.fulfill({
   status:200,contentType:"application/json",body:"[]"
 }));
 await login(page);
 await page.goto("/dashboard/certificates/"+certificate);
 await expect(page.getByText("plain A4 page with verification QR",{exact:false})).toBeVisible();
 const pdfEvent=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download Cover Letter (PDF)"}).click();
 const pdfFile=await pdfEvent;
 expect((await PDFDocument.load(await readFile(await pdfFile.path()))).getPageCount()).toBe(1);
 const wordEvent=page.waitForEvent("download");
 await page.getByRole("button",{name:"Download Cover Letter (Word)"}).click();
 const wordFile=await wordEvent;
 const docx=await readFile(await wordFile.path());
 expect(wordFile.suggestedFilename()).toMatch(/CV-EMPTY-2026\.docx$/);
 expect(docx.subarray(0,4).toString("latin1")).toBe("PK\x03\x04");
 expect(docx.includes(Buffer.from("word/header1.xml"))).toBe(true);
});
