import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const id="20000000-0000-0000-0000-000000000001";
const publicId="30000000-0000-0000-0000-000000000001";
test.beforeEach(async ({ request }) => { await request.post("http://127.0.0.1:54329/test/reset"); });

test("administrator revokes with separate private/public reasons and QR record stays identifiable",async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{ exact:true }).fill("existing-password");
  await page.getByRole("button",{ name:"Sign in",exact:true }).click();
  await expect(page.getByLabel("Current account")).toBeVisible();
  await page.goto(`/dashboard/certificates/${id}`);
  await page.getByRole("button",{ name:"Revoke certificate",exact:true }).click();
  await page.getByLabel("Revocation reason (internal)").fill("   ");
  await page.getByRole("button",{ name:"Confirm permanent revocation" }).click();
  await expect(page.getByRole("alert").filter({ hasText:"A revocation reason is required." })).toBeVisible();
  await page.getByLabel("Revocation reason (internal)").fill("CONFIDENTIAL-INVESTIGATION");
  await page.getByLabel("Public explanation (optional)").fill("Withdrawn after issuer review");
  await page.getByRole("button",{ name:"Confirm permanent revocation" }).click();
  await expect(page.getByRole("heading",{ name:"Revocation record" })).toBeVisible();
  await expect(page.getByRole("button",{ name:"Revoke certificate",exact:true })).toHaveCount(0);
  await page.goto(`/verify/${publicId}`);
  await expect(page.getByRole("heading",{ name:"Certificate Revoked",exact:true })).toBeVisible();
  await expect(page.getByText("Withdrawn after issuer review",{ exact:true })).toBeVisible();
  await expect(page.getByText("CONFIDENTIAL-INVESTIGATION",{ exact:false })).toHaveCount(0);
  await expect(page.getByRole("link",{ name:"Powered by CertVerify",exact:false })).toHaveAttribute("href","/");
});

test("administrators can mark inactive and restore Active before revocation",async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{ exact:true }).fill("existing-password");
  await page.getByRole("button",{ name:"Sign in",exact:true }).click();
  await expect(page.getByLabel("Current account")).toBeVisible();
  await page.goto(`/dashboard/certificates/${id}`);
  await page.getByRole("button",{ name:"Mark inactive" }).click();
  await page.getByRole("button",{ name:"Confirm status change" }).click();
  await expect(page.getByRole("button",{ name:"Restore active" })).toBeVisible();
  await page.getByRole("button",{ name:"Restore active" }).click();
  await page.getByRole("button",{ name:"Confirm status change" }).click();
  await expect(page.getByRole("button",{ name:"Mark inactive" })).toBeVisible();
});

test("members do not receive administrative status controls",async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("new@example.test");
  await page.getByLabel("Password",{ exact:true }).fill("member-password");
  await page.getByRole("button",{ name:"Sign in",exact:true }).click();
  await expect(page.getByLabel("Current account")).toBeVisible();
  await page.goto(`/dashboard/certificates/${id}`);
  await expect(page.getByRole("heading",{ name:"Certificate Details",exact:true,level:1 })).toBeVisible();
  await expect(page.getByRole("button",{ name:"Revoke certificate",exact:true })).toHaveCount(0);
});

for (const [reference,title] of [["active-fixture","Certificate Verified"],["inactive-fixture","Certificate Inactive"],["revoked-fixture","Certificate Revoked"]]) {
  test(`public ${reference} displays the current result without login`,async ({ page }) => {
    await page.goto(`/verify/${reference}`);
    await expect(page.getByRole("heading",{ name:title,exact:true })).toBeVisible();
    await expect(page.getByText("Test Issuer",{ exact:true })).toBeVisible();
    await expect(page.getByText("Public certificate record",{ exact:true })).toBeVisible();
  });
}
test("database failures are not presented as not-found or a valid certificate",async ({ page }) => {
  await page.goto("/verify/unavailable-fixture");
  await expect(page.getByRole("heading",{ name:"Verification Temporarily Unavailable" })).toBeVisible();
  await expect(page.getByRole("heading",{ name:"Certificate Verified",exact:true })).toHaveCount(0);
});

test("QR downloads produce PNG and JPEG files linked to the canonical public record",async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{ exact:true }).fill("existing-password");
  await page.getByRole("button",{ name:"Sign in",exact:true }).click();
  await expect(page.getByLabel("Current account")).toBeVisible();
  await page.goto(`/dashboard/certificates/${id}`);
  await page.getByRole("button",{ name:"Generate QR",exact:true }).click();
  await expect(page.getByText(`http://127.0.0.1:3100/verify/${publicId}`,{ exact:true })).toBeVisible();
  for (const [name,signature,extension] of [["Download PNG",[137,80,78,71],".png"],["Download JPEG",[255,216,255],".jpg"]] as const) {
    const pending=page.waitForEvent("download");
    await page.getByRole("button",{ name,exact:true }).click();
    const download=await pending;
    expect(download.suggestedFilename().endsWith(extension)).toBe(true);
    const bytes=await readFile((await download.path())!);
    expect([...bytes.subarray(0,signature.length)]).toEqual(signature);
  }
});
