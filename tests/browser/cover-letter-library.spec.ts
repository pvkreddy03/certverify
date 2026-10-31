import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
const a = "10000000-0000-0000-0000-000000000001";
const uid = "00000000-0000-0000-0000-000000000001";
const cert = "20000000-0000-0000-0000-000000000001";
const verify = "30000000-0000-0000-0000-000000000001";
const head = "70000000-0000-0000-0000-000000000001";
const saved = "71000000-0000-0000-0000-000000000001";
const savedPath = a + "/" + uid + "/" + saved + ".pdf";
const headPath = a + "/" + head + "/72000000-0000-0000-0000-000000000001.pdf";
async function pdf() {
  const document = await PDFDocument.create();
  document.addPage([595,842]);
  return Buffer.from(await document.save());
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", {exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
}
test.beforeEach(async ({request}) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("My Cover Letters lists named PDFs and letterheads, supports renaming and repeat download", async ({page}) => {
  let name = "Valuation Letter October";
  const pdfBytes = await pdf();
  await page.route("**/rest/v1/cv_saved_cover_letters*", async route => {
    if (route.request().method()==="PATCH") {
      name = route.request().postDataJSON().name;
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:saved,name})});
    }
    return route.fulfill({status:200,contentType:"application/json",
      body:JSON.stringify([{id:saved,account_id:a,certificate_id:cert,letterhead_id:head,
        pdf_storage_path:savedPath,output_mode:"qr",includes_report:false,created_by:uid,
        created_at:"2026-10-31T04:00:00Z",name}])});
  });
  await page.route("**/rest/v1/cv_cover_letter_templates*", route => route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{id:head,name:"Office Letterhead",file_type:"application/pdf",created_at:"2026-10-31T02:00:00Z"}])}));
  await page.route("**/rest/v1/certificates*", route => route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{id:cert,certificate_id:"CV-TEST-001",status:"Active",created_at:"2026-10-31T02:00:00Z"}])}));
  await page.route("**/storage/v1/object/**", route => route.fulfill({status:200,contentType:"application/pdf",body:pdfBytes}));
  await login(page);
  await page.goto("/dashboard/my-cover-letters");
  await expect(page.getByRole("heading",{name:"My Cover Letters"})).toBeVisible();
  await expect(page.getByText("Valuation Letter October")).toBeVisible();
  await expect(page.getByText("Office Letterhead")).toBeVisible();
  await page.getByRole("button",{name:"Rename"}).click();
  await page.getByRole("textbox",{name:"Rename cover letter"}).fill("Updated SBI Cover");
  await page.getByRole("button",{name:"Save name"}).click();
  await expect(page.getByText("Updated SBI Cover")).toBeVisible();
  const promise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download PDF"}).click();
  expect((await promise).suggestedFilename()).toBe("Updated SBI Cover.pdf");
  await expect(page.getByRole("link",{name:"Use / Edit"})).toHaveAttribute("href","/dashboard/cover-letters?letterhead="+head);
});

test("saved letterhead generates named PDF, saves a record and redirects to My Cover Letters", async ({page}) => {
  const pdfBytes=await pdf();
  let created: Record<string,unknown> | null = null;
  let savedFile=false;
  await page.route("**/rest/v1/cv_cover_letter_templates*", route => route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{id:head,account_id:a,name:"Office Letterhead",file_name:"letterhead.pdf",file_type:"application/pdf",
      storage_path:headPath,body_template:"",template_id:null,report_format_id:null,
      qr_x:0.79,qr_y:0.75,qr_size:0.16,text_x:0.13,text_y:0.28,text_width:0.72,text_height:0.42}])}));
  await page.route("**/rest/v1/certificates*", route => route.fulfill({status:200,contentType:"application/json",
    body:JSON.stringify([{id:cert,certificate_id:"CV-TEST-001",public_verification_id:verify,
      template_id:null,template_name:"Certificate",report_format_id:null,status:"Active",created_at:"2026-10-31T02:00:00Z"}])}));
  await page.route("**/rest/v1/cv_saved_cover_letters*", async route => {
    if(route.request().method()==="POST") {
      created=route.request().postDataJSON();
      return route.fulfill({status:201,contentType:"application/json",body:""});
    }
    return route.fulfill({status:200,contentType:"application/json",
      body:created ? JSON.stringify([{...created,created_at:"2026-10-31T04:00:00Z"}]) : "[]"});
  });
  await page.route("**/storage/v1/object/**", async route => {
    if(route.request().method()==="POST") {
      savedFile=true;
      return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({Key:"cover"})});
    }
    return route.fulfill({status:200,contentType:"application/pdf",body:pdfBytes});
  });
  await login(page);
  await page.goto("/dashboard/cover-letters?letterhead="+head);
  await expect(page.getByRole("combobox",{name:"Choose saved letterhead"})).toHaveValue(head,{timeout:20000});
  await page.getByRole("textbox",{name:"Cover letter name"}).fill("My First Official Cover");
  await page.getByRole("button",{name:/Save Cover Letter/}).click();
  await expect(page).toHaveURL(/\/dashboard\/my-cover-letters\?saved=1/,{timeout:30000});
  await expect(page.getByText("My First Official Cover")).toBeVisible();
  expect(savedFile).toBe(true);
  expect(created).toMatchObject({name:"My First Official Cover",certificate_id:cert,letterhead_id:head,output_mode:"qr",includes_report:false});
});

test("compact navigation has My Cover Letters under Certificates and Formats",async ({page})=>{
  await login(page);
  await page.goto("/dashboard");
  await page.getByLabel("My Certificates",{exact:true}).first().click();
  await expect(page.getByRole("link",{name:"My Cover Letters"}).first()).toBeVisible();
  await page.getByLabel("Templates & Formats").click();
  await expect(page.getByRole("link",{name:"My Cover Letters"}).last()).toBeVisible();
});
