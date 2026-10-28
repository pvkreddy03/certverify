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
test("platform edits proposed example pricing as a draft and activates it explicitly", async ({
  page,
}) => {
  await login(page, true);
  await page
    .getByRole("link", { name: "Pricing and offers", exact: true })
    .click();
  await page.getByRole("combobox",{name:"Pricing and offers view"}).selectOption("create");
  await page
    .getByRole("combobox", {
      name: "Optional editable pricing example",
      exact: true,
    })
    .selectOption("0");
  await page
    .getByLabel("Plan name", { exact: true })
    .fill("Editable commercial example");
  await page.getByLabel("Subscription price", { exact: true }).fill("450");
  await page
    .getByLabel("Certificate limit per billing period", { exact: true })
    .fill("15");
  await page
    .getByRole("button", { name: "Save plan draft/version", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "immutable version history",
  );
  const item = page
    .getByRole("article")
    .filter({ hasText: "Editable commercial example" });
  await expect(item).toContainText("draft");
  await expect(item).toContainText("450.00");
  await item
    .getByRole("button", { name: "Activate plan", exact: true })
    .click();
  await expect(item).toContainText("active");
  await item.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Subscription price", { exact: true }).fill("550");
  await page
    .getByRole("button", { name: "Save plan draft/version", exact: true })
    .click();
  await expect(item).toContainText("550.00");
});
test("coupon administration records configurable discount, duration and expiry", async ({
  page,
}) => {
  await login(page, true);
  await page.goto("/platform/pricing");
  await page.getByRole("combobox",{name:"Pricing and offers view"}).selectOption("create");
  await page.getByRole("combobox",{name:"What would you like to create?"}).selectOption("offer");
  await page.getByLabel("Offer name", { exact: true }).fill("Welcome campaign");
  await page
    .getByLabel("Coupon code (permanent)", { exact: true })
    .fill("WELCOME50");
  await page
    .getByLabel("Discount percentage (e.g. 50 for 50%)", { exact: true })
    .fill("50");
  await page
    .getByRole("combobox", { name: "Offer eligibility", exact: true })
    .selectOption("all");
  await page
    .getByLabel("Introductory billing cycles", { exact: true })
    .fill("3");
  await page
    .getByLabel("Campaign expires (your local time)", { exact: true })
    .fill("2040-01-01T12:00");
  await page
    .getByRole("button", { name: "Save offer draft/version", exact: true })
    .click();
  const item = page.getByRole("article").filter({ hasText: "WELCOME50" });
  await expect(item).toContainText("3 discounted cycles");
  await item
    .getByRole("button", { name: "Activate offer", exact: true })
    .click();
  await expect(item).toContainText("active");
  await item
    .getByRole("button", { name: "Disable offer", exact: true })
    .click();
  await expect(item).toContainText("inactive");
});
test("paid subscription selections show server prices and stay pending without checkout or access", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:54329/test/billing-reset");
  await login(page);
  await page.goto("/dashboard/subscription");
  await page
    .getByRole("button", { name: "Get subscription quote", exact: true })
    .click();
  await expect(page.getByText(/Quoted amount:.*999.00/)).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm quoted subscription", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "no charge or paid access activation",
  );
  await expect(
    page.getByRole("heading", { name: "Current subscription — unsubscribed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Payment intent history" }),
  ).toBeVisible();
  await page.goto("/dashboard/templates");
  await expect(
    page.getByRole("heading", { name: "Subscription required", exact: true }),
  ).toBeVisible();
});
test("a free trial activates only after the quoted terms are confirmed and exposes quota", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:54329/test/billing-reset");
  await login(page);
  await page.goto("/dashboard/subscription");
  await page
    .getByRole("button", { name: "Request free trial quote", exact: true })
    .click();
  await expect(page.getByText(/Quoted amount:.*0.00/)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Current subscription — unsubscribed" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm quoted subscription", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Current subscription — trial" }),
  ).toBeVisible();
  await expect(
    page.getByText("Remaining certificates: 20", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Request free trial quote", exact: true }),
  ).toBeDisabled();
  await page.goto("/dashboard/templates");
  await expect(
    page.getByRole("heading", { name: "Subscription required", exact: true }),
  ).toHaveCount(0);
});
test("expired subscriptions retain renewal/history and public verification without paid UI access", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:54329/test/billing-expire");
  await login(page);
  await page.goto("/dashboard/templates");
  await expect(
    page.getByRole("heading", { name: "Subscription required", exact: true }),
  ).toBeVisible();
  await page.goto("/dashboard/subscription");
  await expect(
    page.getByRole("heading", { name: "Current subscription — expired" }),
  ).toBeVisible();
  await expect(
    page.getByText("Remaining certificates: 0", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Quote renewal at agreed price", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Review quoted subscription",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/verify/active-fixture");
  await expect(
    page.getByRole("heading", { name: "Certificate Verified", exact: true }),
  ).toBeVisible();
});
test("cancel renewal preserves current access and platform complimentary grants are explicit", async ({
  page,
}) => {
  await login(page);
  await page.goto("/dashboard/subscription");
  await page
    .getByRole("button", { name: "Cancel renewal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Current subscription — non_renewing" }),
  ).toBeVisible();
  await expect(
    page.getByText("New certificate issuance: Eligible subject to quota", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume renewal preference", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Current subscription — active" }),
  ).toBeVisible();
});
test("MFA administrator grants waived access with a mandatory audited reason", async ({
  page,
}) => {
  await login(page, true);
  await page.getByRole("link", { name: "Subscriptions", exact: true }).click();
  await page
    .getByLabel("Complimentary grant reason", { exact: true })
    .fill("Approved promotional customer access");
  await page
    .getByRole("button", { name: "Review complimentary grant", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm complimentary grant", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("No charge occurred");
});
test("customer owners cannot enter pricing administration and endpoints require explicit bearer authorization", async ({
  page,
}) => {
  await login(page);
  await page.goto("/platform/pricing");
  await expect(page).toHaveURL(/\/dashboard$/);
  const response = await page.request.get("/api/platform/pricing");
  expect(response.status()).toBe(401);
  await page.goto("/dashboard/subscription");
  await expect(
    page.getByRole("heading", { name: "Current subscription — active" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm complimentary grant" }),
  ).toHaveCount(0);
});
