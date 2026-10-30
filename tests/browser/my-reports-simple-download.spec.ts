import { test, expect, type Page } from "@playwright/test";

const templateId = "41000000-0000-0000-0000-000000000001";
const certificateId = "20000000-0000-0000-0000-000000000001";
const formatId = "55000000-0000-0000-0000-000000000001";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("My Reports goes straight to search and offers Download Report without internal explanations", async ({ page }) => {
  await login(page);
  await page.route("**/rest/v1/certificates*", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
      id: certificateId, certificate_id: "CV-EXAMPLE-001", template_id: templateId,
      template_name: "Compliance Certificate", report_format_id: formatId,
      status: "Active", created_at: "2026-10-29T00:00:00Z",
    }]) });
  });
  await page.route("**/rest/v1/cv_report_format_library*", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
      id: formatId, template_id: templateId, format_name: "Client Report",
      storage_path: "test/report.docx", bindings: [{ fieldName: "Client Name", paragraph: 0, start: 0, end: 4 }],
    }]) });
  });
  await page.route("**/rest/v1/certificate_field_values*", async route => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
      field_name: "Client Name", field_value: "Example Client",
    }]) });
  });

  await page.goto("/dashboard/reports");
  await expect(page.getByRole("heading", { name: "My Reports" })).toBeVisible();
  await expect(page.getByText("Search reports")).toBeVisible();
  await expect(page.getByPlaceholder("Certificate number, template or status")).toBeVisible();
  await expect(page.getByText("Reports are generated only when you download them")).toHaveCount(0);
  await expect(page.getByText(/No generated Word report files are retained/)).toHaveCount(0);
  await expect(page.getByText(/CertVerify keeps the original Word formats/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Generate Word report" })).toHaveCount(0);

  await expect(page.getByText("CV-EXAMPLE-001")).toBeVisible();
  await page.getByRole("button", { name: "Download Report" }).click();
  await expect(page.getByRole("combobox", { name: "Report format" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download Report" })).toHaveCount(1);
  await expect(page.getByText(/Generated Word reports are never stored/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Report designer" })).toHaveCount(0);
});
