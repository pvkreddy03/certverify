import { test, expect } from "@playwright/test";
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/test/reset"); });
test("account MFA enrollment is available before privileged bootstrap and never grants platform access", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/test/billing-expire");
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/account/security");
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  await expect(page.getByAltText("Authenticator setup QR")).toBeVisible();
  await page.getByLabel("Authenticator code").fill("000000");
  await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("could not be verified");
  await page.getByLabel("Authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("separate approved administrator grant");
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/dashboard$/);
});
test("unauthenticated visitors cannot open account MFA setup", async ({ page }) => {
  await page.goto("/account/security");
  await expect(page).toHaveURL(/\/login$/);
});
