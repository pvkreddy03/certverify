import { test, expect } from "@playwright/test";

test("authorized administrator receives platform landing page from regular sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("platform@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/platform$/);
  await expect(page.getByRole("link", { name: "Pricing and offers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Branding approvals" })).toBeVisible();
});
