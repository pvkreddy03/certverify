import { test, expect } from "@playwright/test";

const templateId = "41000000-0000-0000-0000-000000000001";
const fieldId = "42000000-0000-0000-0000-000000000002";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("map search on Enter moves the view but never submits a certificate; location picker uses the full form width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => {
    class FakeMap {
      on() {}
      flyTo() {}
      addControl() {}
      remove() {}
      constructor(options: Record<string, unknown>) { void options; }
    }
    class FakeMarker {
      setLngLat() { return this; }
      addTo() { return this; }
    }
    Object.defineProperty(window, "maplibregl", {
      configurable: true, value: { Map: FakeMap, Marker: FakeMarker, NavigationControl: class {} },
    });
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();

  let certificateCreates = 0;
  let searches = 0;
  await page.route("**/rest/v1/certificate_templates*", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: templateId, name: "Open Plot", description: "" }]),
    });
  });
  await page.route("**/rest/v1/certificate_fields*", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{
      id: fieldId, field_name: "Property Location", field_type: "location", is_required: false,
      is_public: false, display_order: 1,
    }]) });
  });
  await page.route("**/rest/v1/certificates*", async route => {
    if (route.request().method() === "POST") certificateCreates++;
    return route.continue();
  });
  await page.route("**/api/geo/search?*", async route => {
    searches++;
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ lat: 17.4104, lng: 78.5597, label: "Uppal, Hyderabad" }) });
  });

  await page.goto("/dashboard/certificates");
  await page.getByRole("combobox", { name: "Certificate Template" }).selectOption(templateId);
  const input = page.getByRole("searchbox", { name: "Search area for Property Location" });
  await expect(input).toBeVisible();
  await input.fill("Uppal");
  await input.press("Enter");
  await expect(page.getByRole("status")).toContainText("Map moved to the searched area");
  expect(searches).toBe(1);
  expect(certificateCreates).toBe(0);
  await expect(page.getByRole("button", { name: "Use My Current Location" })).toBeVisible();
  const map = page.getByLabel("Interactive property location map");
  await expect(map).toHaveCSS("height", "500px");
  const dimensions = await map.boundingBox();
  expect(dimensions?.width ?? 0).toBeGreaterThan(700);
  await expect(page).toHaveURL(/\/dashboard\/certificates$/);
});

test("Word report hub visibly offers attaching a DOCX to a selected certificate template", async ({ page }) => {
  await page.route("**/rest/v1/certificate_templates*", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify([{ id: templateId, name: "Open Plot", description: "", user_id: "00000000-0000-0000-0000-000000000001" }]),
    });
  });
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
  await page.goto("/dashboard/report-formats");
  await expect(page.getByRole("heading", { name: "Upload a Word report to a certificate template" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Attach Word report/ })).toBeVisible();
});
