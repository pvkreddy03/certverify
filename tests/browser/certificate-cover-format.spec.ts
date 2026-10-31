import { test, expect, type Page } from "@playwright/test";

const account="10000000-0000-0000-0000-000000000001";
const template="41000000-0000-0000-0000-000000000001";
const unrelated="41000000-0000-0000-0000-000000000002";
const report="55000000-0000-0000-0000-000000000001";
const general="70000000-0000-0000-0000-000000000001";
const templated="70000000-0000-0000-0000-000000000002";
const reportLinked="70000000-0000-0000-0000-000000000003";
const other="70000000-0000-0000-0000-000000000004";
const certificate="20000000-0000-0000-0000-000000000001";

async function login(page:Page){
 await page.goto("/login");
 await page.getByLabel("Email address").fill("existing@example.test");
 await page.getByLabel("Password",{exact:true}).fill("test-password");
 await page.getByRole("button",{name:"Sign in",exact:true}).click();
 await expect(page.getByLabel("Workspace")).toBeVisible();
}
test.beforeEach(async ({request})=>{await request.post("http://127.0.0.1:54329/test/reset");});

test("Create Certificate offers saved general/template/report linked cover formats and saves the chosen format",async ({page})=>{
 let inserted:Record<string,unknown>|null=null;
 await page.route("**/rest/v1/certificate_templates*",route=>{
   const isSingle=route.request().url().includes("id=eq.");
   return route.fulfill({status:200,contentType:"application/json",
     body:JSON.stringify(isSingle?{id:template,name:"Property Valuation"}:[{id:template,name:"Property Valuation"}])});
 });
 await page.route("**/rest/v1/cv_report_format_library*",route=>route.fulfill({status:200,contentType:"application/json",
   body:JSON.stringify([{id:report,format_name:"Bank Format",template_id:template,account_id:account,bindings:[],storage_path:"path"}])}));
 await page.route("**/rest/v1/cv_cover_letter_templates*",route=>route.fulfill({status:200,contentType:"application/json",
   body:JSON.stringify([
     {id:general,name:"General Cover",template_id:null,report_format_id:null},
     {id:templated,name:"Property Cover",template_id:template,report_format_id:null},
     {id:reportLinked,name:"Bank-specific Cover",template_id:template,report_format_id:report},
     {id:other,name:"Other template",template_id:unrelated,report_format_id:null},
   ])}));
 await page.route("**/rest/v1/rpc/cv_generate_certificate_id",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify("CV-TEST-2026-100")}));
 await page.route("**/rest/v1/certificates*",route=>{
   if(route.request().method()==="POST"){
     inserted=route.request().postDataJSON();
     return route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({id:certificate})});
   }
   return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify([])});
 });
 await login(page);
 await page.goto("/dashboard/certificates");
 await page.getByRole("combobox",{name:"Certificate Template"}).selectOption(template);
 const coverToggle=page.getByRole("checkbox",{name:"Prepare a Cover Letter too (optional)"});
 await expect(coverToggle).toBeVisible();
 await coverToggle.check();
 const cover=page.getByRole("combobox",{name:"Choose cover letter format"});
 await expect(cover).toHaveValue(templated); // template-specific before report is selected
 await expect(cover.locator("option")).toHaveCount(2);
 await page.getByRole("checkbox",{name:"Prepare a Word report too (optional)"}).check();
 await expect(cover.locator("option")).toHaveCount(3);
 await expect(cover).toHaveValue(reportLinked);
 await cover.selectOption(templated);
 await page.getByRole("button",{name:"Save Certificate"}).click();
 await expect(page).toHaveURL(new RegExp("/dashboard/certificates/"+certificate+"\\?created=1"),{timeout:25000});
 expect(inserted).toMatchObject({template_id:template,report_format_id:report,cover_letter_format_id:templated});
});

test("Create Certificate gives a reusable cover setup link and does not force generated PDF storage",async ({page})=>{
 await page.route("**/rest/v1/cv_cover_letter_templates*",route=>route.fulfill({status:200,contentType:"application/json",body:"[]"}));
 await login(page);
 await page.goto("/dashboard/certificates");
 await page.getByRole("combobox",{name:"Certificate Template"}).selectOption(template);
 await expect(page.getByRole("checkbox",{name:"Prepare a Cover Letter too (optional)"})).toBeVisible();
 await expect(page.getByRole("link",{name:/Create Cover Letter Format/})).toHaveAttribute("href","/dashboard/cover-letters?template="+template);
});
