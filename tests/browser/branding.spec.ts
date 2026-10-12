import { test,expect,type Page } from "@playwright/test";
import sharp from "sharp";
async function login(page:Page,email="existing@example.test",next="") {
  await page.goto(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password",{ exact:true }).fill("test-password");
  await page.getByRole("button",{ name:"Sign in",exact:true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
test.beforeEach(async({ request })=>{ await request.post("http://127.0.0.1:54329/test/reset"); });
test("branding requests require independent MFA approval; issued identity stays fixed",async({ page,browser })=>{
  await login(page);await expect(page.getByLabel("Current account")).toBeVisible();
  await page.goto("/dashboard/branding");
  await page.getByLabel("Company or professional name").fill("Updated Professional Company");
  await page.getByRole("button",{ name:"Submit for approval" }).click();
  await expect(page.getByRole("status")).toContainText("submitted for Super Admin approval");
  await expect(page.getByRole("heading",{ name:"Current approved identity" }).locator("..")).toContainText("Test Issuer");
  const context=await browser.newContext();const admin=await context.newPage();
  await login(admin,"platform@example.test","/platform/branding");
  await expect(admin.getByRole("heading",{ name:"Platform MFA verification" })).toBeVisible();
  await expect(admin.getByRole("button",{ name:"Approve branding" })).toHaveCount(0);
  await admin.getByLabel("Authenticator code").fill("123456");await admin.getByRole("button",{ name:"Verify MFA" }).click();
  await expect(admin.getByRole("button",{ name:"Approve branding" })).toBeVisible();
  await admin.getByRole("button",{ name:"Approve branding" }).click();
  await expect(admin.getByRole("heading",{ name:/Updated Professional Company — approved/ })).toBeVisible();
  await page.reload();await expect(page.getByRole("heading",{ name:"Current approved identity" }).locator("..")).toContainText("Updated Professional Company");
  await page.goto("/dashboard/templates");await expect(page.getByText("Updated Professional Company",{ exact:true })).toBeVisible();
  await page.goto("/verify/active-fixture");await expect(page.getByText("Test Issuer",{ exact:true })).toBeVisible();
  await expect(page.getByRole("link",{ name:"Powered by CertVerify" })).toHaveAttribute("href","/");
  await context.close();
});
test("members can view branding but cannot request changes or access platform approvals",async({ page })=>{
  await login(page,"new@example.test");await expect(page.getByLabel("Current account")).toBeVisible();
  await page.goto("/dashboard/branding");await expect(page.getByRole("heading",{ name:"Current approved identity" }).locator("..")).toContainText("Test Issuer");
  await expect(page.getByRole("button",{ name:"Submit for approval" })).toHaveCount(0);
  await page.goto("/platform/branding");await expect(page).toHaveURL(/\/dashboard/);
});
test("logo uploads normalize valid images privately and reject unsupported files",async({ page })=>{
  await login(page);await expect(page.getByLabel("Current account")).toBeVisible();await page.goto("/dashboard/branding");
  await page.getByLabel("Proposed logo").setInputFiles({ name:"unsafe.svg",mimeType:"image/svg+xml",buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await expect(page.getByRole("status")).toContainText(/PNG|JPEG|WebP/);
  const png=await sharp({ create:{ width:32,height:32,channels:3,background:"blue" } }).png().toBuffer();
  await page.getByLabel("Proposed logo").setInputFiles({ name:"logo.png",mimeType:"image/png",buffer:png });
  await expect(page.getByRole("status")).toContainText("uploaded privately");
  const image=page.getByAltText("Proposed issuer logo");await expect(image).toBeVisible();
  await expect.poll(()=>image.evaluate((node)=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("heading",{ name:"Current approved identity" }).locator("..").getByRole("img")).toHaveCount(0);
});
test("missing stored logo returns a sanitized 404 rather than an uncaught failure",async({ page })=>{
  await login(page);await expect(page.getByLabel("Current account")).toBeVisible();
  const response=await page.request.get("/api/branding/logo/50000000-0000-0000-0000-000000000099?account=10000000-0000-0000-0000-000000000001");
  expect(response.status()).toBe(404);expect(await response.json()).toEqual({ error:"Logo unavailable." });
});
test("ambiguous upload finalization retains the object and leaves approved branding unchanged",async({ page,request })=>{
  await request.post("http://127.0.0.1:54329/test/finalize-failure");
  await login(page);await expect(page.getByLabel("Current account")).toBeVisible();await page.goto("/dashboard/branding");
  const png=await sharp({ create:{ width:32,height:32,channels:3,background:"blue" } }).png().toBuffer();
  await page.getByLabel("Proposed logo").setInputFiles({ name:"logo.png",mimeType:"image/png",buffer:png });
  await expect(page.getByRole("status")).toContainText("could not be finalized");
  const state=await request.get("http://127.0.0.1:54329/test/storage-state");expect(await state.json()).toEqual({ objects:1,deletes:0 });
  await expect(page.getByAltText("Proposed issuer logo")).toHaveCount(0);
  await expect(page.getByRole("heading",{ name:"Current approved identity" }).locator("..")).toContainText("Test Issuer");
});
