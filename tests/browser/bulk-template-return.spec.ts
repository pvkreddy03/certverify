import { test, expect } from "@playwright/test";

test.beforeEach(async({request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("Bulk Excel template dropdown opens new template form and preserves bulk return intent",async({page})=>{
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|\?|$)/);
  await page.goto("/dashboard/certificates/bulk");

  await expect(page.getByRole("heading",{name:"Bulk certificate generation"})).toBeVisible();
  const selector=page.getByRole("combobox",{name:"Certificate template"});
  await expect(selector).toBeVisible();
  await expect(selector.locator('option[value="__create__"]')).toHaveText("＋ Create a new template…");
  await selector.selectOption("__create__");
  await expect(page).toHaveURL(/\/dashboard\/templates\?create=1&from=bulk/);
  await expect(page.getByRole("heading",{name:"Create a new template"})).toBeVisible();
  await expect(page.getByText("then return to Bulk Excel")).toBeVisible();
});
