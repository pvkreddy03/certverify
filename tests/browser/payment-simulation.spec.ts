import { test, expect, type Page } from "@playwright/test";

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

test("mocked checkout demonstration labels all outcomes and preserves pending subscription and denied paid access", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/test/billing-reset");
  let gatewayRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("razorpay.com")) gatewayRequests++;
  });
  // Browser presentation test only: hosted activation is intentionally absent.
  await page.route("**/api/payments/simulate", async (route) => {
    const outcome = route.request().method() === "POST"
      ? route.request().postDataJSON().outcome : null;
    await route.fulfill({ json: outcome ? {
      demoOnly: true, outcome,
      message: "Demo only — no payment recorded or subscription activated.",
      paymentRecorded: false, subscriptionActivated: false, settlement: null,
    } : { enabled: true } });
  });
  await login(page);
  await page.goto("/dashboard/subscription");
  await expect(page.getByRole("heading", { name: "Checkout demonstration" })).toBeVisible();
  await page.getByRole("button", { name: "Get subscription quote", exact: true }).click();
  await page.getByRole("button", { name: "Confirm quoted subscription", exact: true }).click();
  const demonstration = page.getByRole("heading", { name: "Checkout demonstration" }).locator("..");
  for (const outcome of ["approved", "declined", "cancelled"])
    await test.step(`explicitly simulated ${outcome}`, async () => {
      await demonstration.getByRole("button", { name: `Demonstrate ${outcome} checkout` }).click();
      await expect(demonstration.getByRole("status")).toContainText(`Demonstration outcome: ${outcome}`);
      await expect(demonstration.getByRole("status")).toContainText("no payment recorded or subscription activated");
      await expect(page.getByRole("heading", { name: "Current subscription — unsubscribed" })).toBeVisible();
    });
  await expect(page.getByRole("heading", { name: "Payment intent history" }).locator("..")).toContainText("pending");
  await page.goto("/dashboard/templates");
  await expect(page.getByRole("heading", { name: "Subscription required", exact: true })).toBeVisible();
  expect(gatewayRequests).toBe(0);
});

test("real demo endpoint denies anonymous requests and stays disabled on non-staging configuration", async ({ page, request }) => {
  const denied = await request.post("/api/payments/simulate", { data: { outcome: "approved" } });
  expect(denied.status()).toBe(401);
  await login(page);
  await page.goto("/dashboard/subscription");
  await expect(page.getByRole("heading", { name: "Checkout demonstration" })).toHaveCount(0);
});
