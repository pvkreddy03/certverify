import { test, expect } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

async function signIn(page: import("@playwright/test").Page, email="existing@example.test") {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
}

test("dashboard round profile icon opens private profile without an active subscription", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/test/billing-expire");
  await signIn(page);
  const profile = page.getByRole("navigation", { name: "Customer dashboard pages" })
    .getByRole("link", { name: "My Profile" });
  await expect(profile).toBeVisible();
  await profile.click();
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Subscription required" })).toHaveCount(0);
});

test("unapproved sub-user sees Reference Map permission message, not private locations", async ({ page }) => {
  await signIn(page, "new@example.test");
  await page.route("**/api/geo/references", async route => {
    await route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ error: "Reference Map permission required." }),
    });
  });
  await page.goto("/dashboard/reference-map");
  await expect(page.getByRole("heading", { name: "Reference Map access requires permission" })).toBeVisible();
  await expect(page.getByText("Team → Team Members")).toBeVisible();
  await expect(page.getByLabel("Interactive property location map")).toHaveCount(0);
});
