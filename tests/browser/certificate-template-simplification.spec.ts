import { expect, test } from "@playwright/test";

const templateId = "41000000-0000-0000-0000-000000000001";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("certificate creation has one template-creation choice, no editable ID, and no duplicate organization panel", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard/certificates");
  await expect(page.getByRole("heading", { name: "Create Certificate", exact: true })).toBeVisible();
  const select = page.locator("#certificate-template");
  await expect(select.locator('option[value="__create__"]')).toHaveCount(1);
  await expect(page.getByRole("link", { name: /Create and configure a new template/ })).toHaveCount(0);
  await expect(page.getByPlaceholder("Generated when certificate is saved")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Account branding" })).toHaveCount(0);
  await expect(page.getByText("Your verification ID and QR code are created automatically")).toBeVisible();
});

test("saved templates offer an Excel download named for the selected template", async ({ page }) => {
  await login(page);
  await page.route("**/rest/v1/certificate_templates*", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: templateId, name: "Client Certificate", description: "Reusable fields", created_at: "2026-10-01T00:00:00Z" }]),
    });
  });
  let downloadedId = "";
  await page.route("**/api/bulk/template?template=*", async route => {
    downloadedId = new URL(route.request().url()).searchParams.get("template") ?? "";
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      body: Buffer.from("test-xlsx-fixture"),
    });
  });
  await page.goto("/dashboard/templates");
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Account branding" })).toHaveCount(0);
  const card = page.locator("article").filter({ has: page.getByRole("heading", { name: "Client Certificate" }) });
  await expect(card.getByRole("link", { name: "Edit Fields" })).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await card.getByRole("button", { name: "Download Excel format for Client Certificate" }).click();
  const download = await downloadEvent;
  expect(downloadedId).toBe(templateId);
  expect(download.suggestedFilename()).toBe("Client Certificate - Excel Template.xlsx");
});

test("empty templates explain why Excel format cannot be downloaded", async ({ page }) => {
  await login(page);
  await page.route("**/rest/v1/certificate_templates*", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: templateId, name: "Empty Template", description: null, created_at: "2026-10-01T00:00:00Z" }]),
    });
  });
  await page.route("**/api/bulk/template?template=*", route => route.fulfill({
    status: 404, contentType: "application/json",
    body: JSON.stringify({ error: "Template unavailable or has no fields." }),
  }));
  await page.goto("/dashboard/templates");
  await page.getByRole("button", { name: "Download Excel format for Empty Template" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Add fields to this template" })).toBeVisible();
});
