import { test, expect } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, email: string, path = "/login") {
  await page.goto(path);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("verified Super Admin uses server landing then enters platform with MFA", async ({ page }) => {
  const landing = page.waitForRequest((request) => request.url().includes("/auth/landing"));
  await signIn(page, "platform@example.test");
  await landing;
  // Login cookies are scoped to the original host; never redirect to localhost.
  await expect(page).toHaveURL("http://127.0.0.1:3100/platform");
  await expect(page.getByRole("link", { name: "Pricing and offers" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Branding approvals" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Platform MFA verification" })).toBeVisible();
  await page.getByLabel("Authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify MFA" }).click();
  await expect(page.getByText("Registered accounts")).toBeVisible();
});

test("verified administrator cannot be diverted to customer dashboard by a requested next URL", async ({ page }) => {
  await signIn(page, "platform@example.test", "/login?next=%2Fdashboard");
  await expect(page).toHaveURL(/\/platform$/);
});

test("ordinary customer lands on dashboard and is denied manual platform access", async ({ page }) => {
  await signIn(page, "existing@example.test");
  await expect(page.getByLabel("Workspace")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("ordinary customer cannot use next parameter to access platform", async ({ page }) => {
  await signIn(page, "existing@example.test", "/login?next=%2Fplatform");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("signed-out visitors cannot use the login landing route", async ({ page }) => {
  await page.goto("/auth/landing");
  await expect(page).toHaveURL(/\/login$/);
});
