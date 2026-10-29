import { test, expect } from "@playwright/test";

test("customer login has no redundant Dashboard or Customer sign-in links", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Customer navigation" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Customer sign in", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
});

test("signup and password recovery retain useful links after login-header cleanup", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("navigation", { name: "Customer navigation" }).getByRole("link", { name: "Customer sign in" })).toBeVisible();
  await page.goto("/forgot-password");
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
});
