import { test, expect } from "@playwright/test";

const template = "41000000-0000-0000-0000-000000000001";
const certificate = "20000000-0000-0000-0000-000000000001";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Current account")).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("the template selector opens creation, with dashboard ribbon always accessible", async ({ page }) => {
  await signIn(page);
  await page.goto("/dashboard/certificates");
  await expect(page.getByRole("navigation", { name: "Customer dashboard pages" })).toBeVisible();
  await expect(page.getByRole("link", { name: "← Dashboard" })).toBeVisible();
  await page.getByRole("combobox", { name: "Certificate Template" }).selectOption("__create__");
  await expect(page).toHaveURL(/\/dashboard\/templates\?create=1&from=certificate/);
  await expect(page.getByRole("heading", { name: "Create Template" })).toBeVisible();
  await page.goto("/dashboard/team");
  await expect(page.getByRole("navigation", { name: "Customer dashboard pages" })).toBeVisible();
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("link", { name: "← Dashboard" })).toBeVisible();
});

test("saving once opens the certificate and automatically shows downloadable QR", async ({ page }) => {
  await signIn(page);
  let inserts = 0;

  await page.route("**/rest/v1/certificate_templates*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: route.request().url().includes("id=eq.")
        ? JSON.stringify({ id: template, name: "Valuation report" })
        : JSON.stringify([{ id: template, name: "Valuation report", description: "Test template" }]),
    });
  });
  await page.route("**/rest/v1/rpc/cv_generate_certificate_id", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("CV-TEST-2026-00001") });
  });
  await page.route("**/rest/v1/certificates*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    inserts += 1;
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: certificate }) });
  });

  await page.goto("/dashboard/certificates");
  await page.getByRole("combobox", { name: "Certificate Template" }).selectOption(template);
  await expect(page.getByRole("button", { name: "Save Certificate" })).toBeEnabled();

  // Dispatch repeated clicks in a single event loop before React updates.
  await page.getByRole("button", { name: "Save Certificate" }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page).toHaveURL(new RegExp(`/dashboard/certificates/${certificate}\\?created=1`));
  expect(inserts).toBe(1);
  await expect(page.getByRole("status")).toContainText("Certificate saved successfully");
  await expect(page.getByAltText("QR code for CV-FIXTURE-1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PNG" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download JPEG" })).toBeVisible();
});
