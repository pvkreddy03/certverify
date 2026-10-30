import { test, expect } from "@playwright/test";
import { ACCOUNT_HEADER } from "../../lib/accounts/context";

const appToken = "a".repeat(64);
const a = "10000000-0000-0000-0000-000000000001";
const b = "10000000-0000-0000-0000-000000000002";

test("new invitation requires name/password and lands in the invited organization", async ({ page }) => {
  await page.goto(`/accept-invite?token=${appToken}&mode=setup&token_hash=new&type=invite`);
  await expect(page.getByLabel("Your name")).toBeVisible();
  await page.getByLabel("Your name").fill("Invited Professional");
  await page.getByLabel("Create password", { exact: true }).fill("a-new-password");
  await page.getByLabel("Confirm password").fill("different-password");
  await page.getByRole("button", { name: "Create account and accept" }).click();
  await expect(page.getByText("The passwords do not match.")).toBeVisible();
  await page.getByLabel("Confirm password").fill("a-new-password");
  const acceptance = page.waitForRequest((request) => request.url().includes("/rpc/cv_accept_invitation"));
  await page.getByRole("button", { name: "Create account and accept" }).click();
  expect((await acceptance).postDataJSON().p_name).toBe("Invited Professional");
  await expect(page.getByLabel("Workspace")).toHaveValue(b);
});

test("existing credentials preserve the invitation and do not prompt for a password reset", async ({ page }) => {
  await page.goto(`/accept-invite?token=${appToken}&mode=join`);
  await page.getByRole("link", { name: "Go to sign in" }).click();
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("existing-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("You are signed in with your existing CertVerify account.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Create password", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Accept invitation", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toHaveValue(b);
});

test("organization switching reloads the workspace and scopes subsequent data requests", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("existing-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toHaveValue(a);
  const scoped = page.waitForRequest((request) => request.url().includes("/rest/v1/certificates") && request.headers()[ACCOUNT_HEADER] === b);
  await page.getByLabel("Workspace").selectOption(b);
  await expect(page.getByLabel("Workspace")).toHaveValue(b);
  expect((await scoped).headers()[ACCOUNT_HEADER]).toBe(b);
});

test("an expired invitation shows a clear error and no setup form", async ({ page }) => {
  await page.goto(`/accept-invite?token=${appToken}&mode=setup&token_hash=expired&type=invite`);
  await expect(page.getByText("This email link is invalid, expired or already used.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Create password", { exact: true })).toHaveCount(0);
});

test("password recovery requires fresh email proof and allows a matching password update", async ({ page }) => {
  await page.goto("/reset-password");
  await expect(page.getByText("Open the newest password-reset email to continue.")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await page.goto("/reset-password?token_hash=recovery&type=recovery");
  await page.getByLabel("New password", { exact: true }).fill("updated-password");
  await page.getByLabel("Confirm new password").fill("updated-password");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Your password has been updated.", { exact: false })).toBeVisible();
});


test("login validates malformed Email IDs and shows live public plans and contact", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Current CertVerify plans")).toBeVisible();
  await expect(page.getByText("Browser baseline plan")).toBeVisible();
  await expect(page.getByText("Public trial offer")).toBeVisible();
  await expect(page.getByText("help@certverify.example")).toBeVisible();
  await page.getByLabel("Email address").fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter a valid Email ID", { exact: false })).toBeVisible();
});

test("signup and recovery validate email format before attempting delivery", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Professional / Business Name").fill("Test Professional");
  await page.getByLabel("Email address").fill("missing-at");
  await page.getByLabel("Password", { exact: true }).fill("password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText("Enter a valid Email ID");

  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("wrong");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Enter a valid Email ID", { exact: false })).toBeVisible();
});

test("a password reset request shows sixty-second resend countdown across refresh", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("button", { name: /Resend reset link in \d+s/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: /Resend reset link in \d+s/ })).toBeDisabled();
});

test("public contact management is not available without administrator authorization", async ({ request }) => {
  const response = await request.get("/api/platform/contact");
  expect(response.status()).toBe(401);
});

test("passwordless invitation recipient must create a password even if invite link says join", async ({ page }) => {
  const rawToken = "a".repeat(64);
  await page.goto(`/accept-invite?token=${rawToken}&mode=join&token_hash=new&type=invite`);
  await expect(page.getByRole("heading", { name: "Set up your CertVerify account" })).toBeVisible();
  await expect(page.getByLabel("Create password", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation", exact: true })).toHaveCount(0);
  await page.getByLabel("Your name").fill("Invited Colleague");
  await page.getByLabel("Create password", { exact: true }).fill("a-valid-password");
  await page.getByLabel("Confirm password").fill("a-valid-password");
  await page.getByRole("button", { name: "Create account and accept" }).click();
  await expect(page.getByLabel("Workspace")).toHaveValue(b);
});

test("team owner sees member emails, not raw user identifiers", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
  await page.goto("/dashboard/team");
  await expect(page.getByText("existing@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("new@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("User ID", { exact: true })).toHaveCount(0);
});

test("security page offers password change and account email reset", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
  await page.goto("/account/security");
  await expect(page.getByRole("heading", { name: "Password and recovery" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("new-safe-password");
  await page.getByLabel("Confirm new password").fill("new-safe-password");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password updated successfully" })).toBeVisible();
  await page.getByRole("button", { name: "Email me a reset link" }).click();
  await expect(page.getByRole("status").filter({ hasText: "password-reset link" })).toBeVisible();
});

test("organization staff can create certificates under company billing without team or subscription controls", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("new@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toHaveValue(a);
  const navigation = page.getByRole("navigation", { name: "Customer dashboard pages" });
  await expect(navigation.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Subscription", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Create certificate" })).toBeVisible();
  await page.goto("/dashboard/certificates");
  await expect(page.getByRole("heading", { name: "Subscription required" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Create Certificate" })).toBeVisible();
  await page.goto("/dashboard/team");
  await expect(page.getByRole("heading", { name: "Managed by your organization" })).toBeVisible();
  await page.goto("/dashboard/subscription");
  await expect(page.getByRole("heading", { name: "Managed by your organization" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose or change a subscription" })).toHaveCount(0);
});

test("organization owner manages team from the ribbon and subscriptions through Settings", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const navigation=page.getByRole("navigation", { name: "Customer dashboard pages" });
  await expect(navigation.getByRole("link", { name: "Team", exact: true })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Subscription", exact: true })).toHaveCount(0);
  await navigation.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("link", { name: /Manage subscriptions/ })).toBeVisible();
  await expect(page.getByText("Current account", { exact: true })).toHaveCount(0);
  await expect(page.getByText("owner", { exact: true })).toHaveCount(0);
});
