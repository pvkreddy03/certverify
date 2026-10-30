import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email = "existing@example.test") {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("grouped desktop ribbon opens My Certificates/My Reports and Templates/Report Formats, while Branding and Security are under Settings", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  const nav = page.getByRole("navigation", { name: "Customer dashboard pages" });
  await expect(nav.getByRole("button", { name: "Sign Out" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "My Profile" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Create Certificate" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Bulk Excel" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Branding" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Security" })).toHaveCount(0);
  const certificates = nav.locator("details").nth(0);
  await certificates.locator("summary").click();
  await expect(certificates.getByRole("link", { name: "My Certificates", exact: true })).toBeVisible();
  await certificates.getByRole("link", { name: "My Reports", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/reports$/);
  await expect(page.getByRole("heading", { name: "My Reports" })).toBeVisible();
  const templates = nav.locator("details").nth(1);
  await templates.locator("summary").click();
  await expect(templates.getByRole("link", { name: "Templates", exact: true })).toBeVisible();
  await templates.getByRole("link", { name: "Report Formats", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/report-formats$/);

  await nav.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("link", { name: /Manage branding/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Manage security/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("main").getByRole("link", { name: "My Profile" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "Sign Out" })).toHaveCount(0);
  await expect(page.getByText("Manage Report Formats")).toBeVisible();
  await expect(page.getByText("Generate from Excel")).toBeVisible();
  await expect(page.locator("section.cv-hero").getByRole("link", { name: /Bulk Excel import/ })).toHaveCount(0);
});

test("mobile ribbon presents the new grouped destinations without duplicate links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 840 });
  await login(page);
  const navigation = page.getByLabel("Navigate to page");
  await expect(navigation).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Customer dashboard pages" }).getByRole("button", { name: "Sign Out" })).toBeVisible();
  await expect(navigation.locator('optgroup[label="My Certificates"] option')).toHaveCount(2);
  await expect(navigation.locator('optgroup[label="Templates & Formats"] option')).toHaveCount(2);
  await expect(navigation.locator('option[value="/dashboard/certificates/bulk"]')).toHaveCount(0);
  await expect(navigation.locator('option[value="/dashboard/branding"]')).toHaveCount(0);
  await expect(navigation.locator('option[value="/account/security"]')).toHaveCount(0);
  await navigation.selectOption("/dashboard/reports");
  await expect(page).toHaveURL(/\/dashboard\/reports$/);
  await page.getByRole("navigation", { name: "Customer dashboard pages" }).getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("security stays accessible to a sub-user while organization branding stays manager-only", async ({ page }) => {
  await login(page, "new@example.test");
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Manage security/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Manage branding/ })).toHaveCount(0);
});
