import { test, expect } from "@playwright/test";
import { createXlsxTemplate } from "../../lib/bulk/xlsx";

test.beforeEach(async({request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
  await request.post("http://127.0.0.1:54329/test/bulk-enable");
});

test("Excel import previews and edits two rows, confirms once and exports separate QR files",async({page,request})=>{
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard(\/)?$/);
  await page.goto("/dashboard/certificates/bulk");
  await page.getByLabel("Certificate template").selectOption("81000000-0000-0000-0000-000000000001");
  await expect(page.getByLabel("Excel file")).toBeEnabled();
  const workbook=createXlsxTemplate(["Owner"],[["Original A"],["Original B"]]);
  await page.getByLabel("Excel file").setInputFiles({name:"october-valuations.xlsx",
    mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:workbook});
  await expect(page.getByText("2 filled rows found.")).toBeVisible();
  await page.getByLabel("Row 3 Owner").fill("Corrected B");
  await expect(page.getByRole("button",{name:"Confirm & generate 2 certificates"})).toBeEnabled();
  await page.getByRole("button",{name:"Confirm & generate 2 certificates"}).evaluate(button=>{
    (button as HTMLButtonElement).click();(button as HTMLButtonElement).click();
  });
  await expect(page.getByText("Batch confirmed — 2 certificates created")).toBeVisible();
  const state=await (await request.get("http://127.0.0.1:54329/test/bulk-state")).json();
  expect(state.created).toBe(1);
  expect(state.batch.items[1].values["82000000-0000-0000-0000-000000000001"]).toBe("Corrected B");
  await page.getByRole("link",{name:"View certificates"}).first().click();
  await expect(page.getByText("CV-FIXTURE-1")).toBeVisible();
  await expect(page.getByText("CV-FIXTURE-2")).toBeVisible();
  const downloadPromise=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download all QRs (JPEG ZIP)"}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});
