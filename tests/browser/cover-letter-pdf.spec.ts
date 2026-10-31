import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const account="10000000-0000-0000-0000-000000000001";
const template="41000000-0000-0000-0000-000000000001";
const certificate="20000000-0000-0000-0000-000000000001";
const verify="30000000-0000-0000-0000-000000000001";

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
  await expect(page.getByRole("heading", {name:"Letterhead + Verification QR"})).toBeVisible();
  await page.getByPlaceholder("Standard cover letter").fill("Standard Valuation Cover");
  await page.locator('input[type=file]').setInputFiles({
    name:"letterhead.pdf", mimeType:"application/pdf", buffer:await samplePdf(),
  });
  await expect(page.getByText("Document ready.", {exact:false})).toBeVisible({timeout:30000});
  const paper=page.getByRole("button",{name:"Click or drag to set QR or text position"});
  await expect(paper).toBeVisible();
  await paper.click({position:{x:70,y:140}});
  await page.getByRole("button",{name:"QR only"}).click();
  await expect(page.getByText("No text entry needed.",{exact:false})).toBeVisible();
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
  await page.getByRole("button",{name:"Type letter"}).click();
  await page.getByPlaceholder("Enter your covering letter. This wording applies only to this download.").fill("To the Branch Manager\nSubject: Valuation report\nPlease find attached the report.");
  await page.getByRole("button",{name:"Preview PDF"}).click();
  await expect(page.getByRole("link",{name:"Open PDF to print"})).toBeVisible({timeout:30000});
});
