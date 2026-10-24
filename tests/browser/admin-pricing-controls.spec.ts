import { test, expect } from "@playwright/test";
test.beforeEach(async ({request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
});
async function openPricing(page: import("@playwright/test").Page) {
  await page.goto("/platform-login");
  await page.getByLabel("Email address").fill("platform@example.test");
  await page.getByLabel("Password",{exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/platform(?:\?|$)/);
  await page.getByLabel("Authenticator code").fill("123456");
  await page.getByRole("button",{name:"Verify MFA",exact:true}).click();
  await page.goto("/platform/pricing");
  await expect(page.getByRole("heading",{name:"Pricing and offers",exact:true})).toBeVisible();
}
test("unlimited certificate count disables numeric quota, while limited enables it",async({page})=>{
  await openPricing(page);
  const limit=page.getByLabel("Certificate limit per billing period",{exact:true});
  const unlimited=page.getByRole("checkbox",{name:"Unlimited certificate generation"});
  await expect(unlimited).toBeChecked();
  await expect(limit).toBeDisabled();
  await unlimited.uncheck();
  await expect(limit).toBeEnabled();
  await limit.fill("42");
  await unlimited.check();
  await expect(limit).toBeDisabled();
  await page.getByRole("combobox",{name:"Optional editable pricing example"}).selectOption("0");
  await expect(unlimited).not.toBeChecked();
  await expect(limit).toBeEnabled();
});
test("monthly and annual hide irrelevant custom period input; custom enables it",async({page})=>{
  await openPricing(page);
  const period=page.getByLabel("Billing period",{exact:true});
  const days=page.getByLabel("Custom period days",{exact:true});
  await expect(days).toBeDisabled();
  await period.selectOption("annual");
  await expect(days).toBeDisabled();
  await period.selectOption("custom");
  await expect(days).toBeEnabled();
  await days.fill("90");
  await period.selectOption("monthly");
  await expect(days).toBeDisabled();
  await expect(page.getByText("Currency decimal places")).toHaveCount(0);
});
test("offer editor enables only relevant discounts, currencies, trial duration and account restriction",async({page})=>{
  await openPricing(page);
  const kind=page.getByLabel("Offer type",{exact:true});
  const discount=page.getByLabel("Discount percentage (e.g. 50 for 50%)",{exact:true});
  const currency=page.getByLabel("Discount currency",{exact:true});
  const trials=page.getByLabel("Offer trial days",{exact:true});
  const cycles=page.getByLabel("Introductory billing cycles",{exact:true});
  const accounts=page.getByLabel("Selected account IDs (comma separated)",{exact:true});
  await expect(discount).toBeEnabled();
  await expect(currency).toBeDisabled();
  await expect(trials).toBeDisabled();
  await expect(cycles).toBeEnabled();
  await expect(accounts).toBeDisabled();
  await kind.selectOption("free_trial");
  await expect(page.getByLabel("Discount (not applicable)",{exact:true})).toBeDisabled();
  await expect(trials).toBeEnabled();
  await expect(cycles).toBeDisabled();
  await kind.selectOption("fixed");
  await expect(currency).toBeEnabled();
  await expect(trials).toBeDisabled();
  await page.getByLabel("Offer eligibility",{exact:true}).selectOption("selected");
  await expect(accounts).toBeEnabled();
});
