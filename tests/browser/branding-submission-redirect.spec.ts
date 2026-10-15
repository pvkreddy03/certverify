import { test,expect } from "@playwright/test";

test.beforeEach(async({request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("double-click branding submission submits once and automatically returns to dashboard",async({page})=>{
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.goto("/dashboard/branding");

  let submitted=0;
  page.on("request",request=>{
    if(request.url().includes("/api/branding/requests") && request.method()==="POST") submitted++;
  });
  await page.getByLabel("Company or professional name").fill("Updated Issuer Branding");
  await page.getByRole("button",{name:"Submit for approval"}).evaluate(button=>{
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });

  await expect(page.getByRole("alertdialog",{name:"Submitted for approval"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Submit for approval"})).toBeDisabled();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(submitted).toBe(1);
});
