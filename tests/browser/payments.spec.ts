import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, admin = false) {
  await page.goto(admin ? "/platform-login" : "/login");
  await page
    .getByLabel("Email address")
    .fill(admin ? "platform@example.test" : "existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/login/);
  if (admin) {
    await page.getByLabel("Authenticator code").fill("123456");
    await page.getByRole("button", { name: "Verify MFA", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Platform MFA verification" }),
    ).toHaveCount(0);
  } else await expect(page.getByLabel("Workspace")).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});
test("unsubscribed owner can reach disabled checkout without creating a charge or claiming success", async ({
  page,
  request,
}) => {
  await login(page);
  await request.post("http://127.0.0.1:54329/test/billing-reset");
  await page.goto(
    "/dashboard/payment?intent=80000000-0000-0000-0000-000000000001",
  );
  await expect(
    page.getByRole("heading", { name: "Payment and verification" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open test checkout" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Payment collection is disabled",
  );
  await expect(page.getByRole("status")).not.toContainText("access is active");
});
test("unauthenticated payment initiation and forged success callbacks cannot grant access", async ({
  request,
}) => {
  for (const path of ["checkout", "verify"]) {
    const result = await request.post(`/api/payments/${path}`, {
      data: {
        intentId: "80000000-0000-0000-0000-000000000001",
        amount: 1,
        status: "paid",
        signature: "forged",
      },
    });
    expect(result.status()).toBe(401);
  }
});
test("platform financial monitoring remains MFA-gated and owner cannot inspect cross-account payments", async ({
  page,
}) => {
  await login(page);
  await page.goto("/platform/payments");
  await expect(page).toHaveURL(/\/dashboard$/);
  expect((await page.request.get("/api/platform/payments")).status()).toBe(401);
});
test("platform administrator can inspect payment monitoring and disabled reconciliation reports clearly", async ({
  page,
}) => {
  await login(page, true);
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Payment monitoring and reconciliation",
    }),
  ).toBeVisible();
  await page.getByLabel("Gateway payment ID").fill("pay_fixture");
  await page
    .getByRole("button", { name: "Fetch authoritative status" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Payment collection is disabled",
  );
});
