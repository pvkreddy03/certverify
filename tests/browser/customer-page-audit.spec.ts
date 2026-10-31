import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
}

test.beforeEach(async ({request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("core dashboard, issuance, certificate, bulk import, reporting and reusable-format screens render",async ({page})=>{
  await login(page);
  const paths=[
    "/dashboard",
    "/dashboard/certificates",
    "/dashboard/certificates/list",
    "/dashboard/certificates/bulk",
    "/dashboard/reports",
    "/dashboard/report-formats",
    "/dashboard/cover-letters",
    "/dashboard/my-cover-letters",
    "/dashboard/templates",
    "/dashboard/reference-map",
  ];
  for(const path of paths){
    await test.step(path,async()=>{
      const response=await page.goto(path,{waitUntil:"domcontentloaded"});
      expect(response?.status(),path).toBeLessThan(500);
      await expect(page.getByRole("main").first(),path).toBeVisible();
      await expect(page.getByText("Application error: a client-side exception", {exact:false}),path).toHaveCount(0);
    });
  }
});

test("settings, profile, subscription, orders, payment, team, branding and security screens render",async ({page})=>{
  await login(page);
  const paths=[
    "/dashboard/settings",
    "/dashboard/profile",
    "/dashboard/subscription",
    "/dashboard/subscription/orders",
    "/dashboard/team",
    "/dashboard/branding",
    "/account/security",
    "/dashboard/payment",
  ];
  for(const path of paths){
    await test.step(path,async()=>{
      const response=await page.goto(path,{waitUntil:"domcontentloaded"});
      expect(response?.status(),path).toBeLessThan(500);
      await expect(page.getByRole("main").first(),path).toBeVisible();
      await expect(page.getByText("Application error: a client-side exception", {exact:false}),path).toHaveCount(0);
    });
  }
});
