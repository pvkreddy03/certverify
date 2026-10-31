import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";

const template="41000000-0000-0000-0000-000000000001";
const head="70000000-0000-0000-0000-000000000001";

async function pdf() {
 const d=await PDFDocument.create();
 d.addPage([595.28,841.89]);
 return Buffer.from(await d.save());
}
async function login(page:Page) {
 await page.goto("/login");
 await page.getByLabel("Email address").fill("existing@example.test");
 await page.getByLabel("Password",{exact:true}).fill("test-password");
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(page.getByLabel("Workspace")).toBeVisible();
}
test.beforeEach(async ({request}) => {await request.post("http://127.0.0.1:54329/test/reset");});

test("My Cover Letters lists only named reusable formats and allows renaming them",async ({page})=>{
 let name="Office Cover";
 await page.route("**/rest/v1/cv_cover_letter_templates*",async route=>{
   if(route.request().method()==="PATCH"){
     name=route.request().postDataJSON().name;
     return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({id:head,name})});
   }
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([{
     id:head,name,file_type:"application/pdf",file_name:"letterhead.pdf",created_at:"2026-10-31T04:00:00Z",
     template_id:template,report_format_id:null,
   }])});
 });
 await page.route("**/rest/v1/certificate_templates*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([{id:template,name:"Property Valuation"}])}));
 await login(page);
 await page.goto("/dashboard/my-cover-letters");
 await expect(page.getByRole("heading",{name:"My Cover Letters"})).toBeVisible();
 await expect(page.getByText("Office Cover")).toBeVisible();
 await expect(page.getByText("Template: Property Valuation", {exact:false})).toBeVisible();
 await expect(page.getByRole("button",{name:"Download PDF"})).toHaveCount(0);
 await page.getByRole("button",{name:"Rename"}).click();
 await page.getByRole("textbox",{name:"Rename cover format"}).fill("Bank Format 2026");
 await page.getByRole("button",{name:"Save name"}).click();
 await expect(page.getByText("Bank Format 2026")).toBeVisible();
 await expect(page.getByRole("link",{name:"Edit format"})).toHaveAttribute("href","/dashboard/cover-letters?letterhead="+head);
});

test("save the letterhead QR layout once, redirect to format library, not per-certificate PDFs",async ({page})=>{
 let created:Record<string,unknown>|null=null,uploads=0,generated=0;
 await page.route("**/rest/v1/cv_cover_letter_templates*",async route=>{
   if(route.request().method()==="POST"){
     created=route.request().postDataJSON();
     return route.fulfill({status:201,contentType:"application/json",body:""});
   }
   return route.fulfill({status:200,contentType:"application/json",body:created?JSON.stringify([{...created,created_at:"2026-10-31T04:00:00Z"}]):"[]"});
 });
 await page.route("**/rest/v1/cv_saved_cover_letters*",route=>{
   generated++;return route.fulfill({status:500,contentType:"application/json",body:"{}"});
 });
 await page.route("**/storage/v1/object/**",route=>{
   if(route.request().method()==="POST"){uploads++;return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({Key:"saved"})});}
   return route.fulfill({status:200,contentType:"application/pdf",body:""});
 });
 await login(page);
 await page.goto("/dashboard/cover-letters");
 await page.getByPlaceholder("Standard cover letter").fill("Permanent Office Layout");
 await page.locator('input[type=file]').setInputFiles({name:"letterhead.pdf",mimeType:"application/pdf",buffer:await pdf()});
 await expect(page.getByText("Document ready.",{exact:false})).toBeVisible({timeout:30000});
 await page.getByRole("button",{name:/Save format/}).click();
 await expect(page).toHaveURL(/\/dashboard\/my-cover-letters#letterheads/,{timeout:30000});
 await expect(page.getByText("Permanent Office Layout")).toBeVisible();
 expect(uploads).toBe(1);
 expect(generated).toBe(0);
 expect(created).toMatchObject({name:"Permanent Office Layout",file_type:"application/pdf"});
});

test("compact ribbon links to My Cover Letters under Certificates and Formats",async ({page})=>{
 await login(page);await page.goto("/dashboard");
 await page.getByLabel("My Certificates",{exact:true}).first().click();
 await expect(page.getByRole("link",{name:"My Cover Letters"}).first()).toBeVisible();
 await page.getByLabel("Templates & Formats").click();
 await expect(page.getByRole("link",{name:"My Cover Letters"}).last()).toBeVisible();
});
