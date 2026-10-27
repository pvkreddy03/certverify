import { test, expect } from "@playwright/test";

test.beforeEach(async ({request})=>{
  await request.post("http://127.0.0.1:54329/test/reset");
});

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password",{exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|\?|$)/);
  await page.goto("/dashboard/certificates/list");
  await expect(page.getByRole("heading",{name:"Export certificates to Excel"})).toBeVisible();
}

test("all certificates export sends authenticated selected-account request and downloads an XLSX",async({page})=>{
  await signIn(page);
  let count=0;
  await page.route("**/api/certificates/export",async route=>{
    count++;
    const req=route.request();
    expect(req.method()).toBe("POST");
    expect(req.postDataJSON()).toEqual({});
    expect(req.headers()["authorization"]).toMatch(/^Bearer /);
    expect(req.headers()["x-certverify-account"]).toBeTruthy();
    await route.fulfill({status:200,body:Buffer.from("PK-test-xlsx"),headers:{
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":'attachment; filename="certverify-certificates-all.xlsx"',
    }});
  });
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"↓ Download Excel"}).click();
  expect((await download).suggestedFilename()).toBe("certverify-certificates-all.xlsx");
  await expect(page.getByRole("status")).toContainText("Excel export ready");
  expect(count).toBe(1);
});

test("inclusive date-range export validates boundaries and forwards selected dates",async({page})=>{
  await signIn(page);
  await page.getByRole("radio",{name:"Choose date range"}).check();
  const from=page.getByLabel("Export from date");
  const to=page.getByLabel("Export to date");
  await expect(from).toBeEnabled();
  await expect(to).toBeEnabled();
  await from.fill("2026-10-01");
  await to.fill("2026-10-27");
  let requested:null|{from:string;to:string}=null;
  await page.route("**/api/certificates/export",async route=>{
    requested=route.request().postDataJSON() as {from:string;to:string};
    await route.fulfill({status:200,body:Buffer.from("PK-test-xlsx"),headers:{
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }});
  });
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"↓ Download Excel"}).click();
  await download;
  expect(requested).toEqual({from:"2026-10-01",to:"2026-10-27"});
  await page.getByRole("radio",{name:"All certificates"}).check();
  await expect(from).toBeDisabled();
  await expect(to).toBeDisabled();
});

test("export warns on oversized report instead of downloading a partial workbook",async({page})=>{
  await signIn(page);
  await page.route("**/api/certificates/export",async route=>{
    await route.fulfill({status:422,contentType:"application/json",body:JSON.stringify({error:"This export exceeds 20,000 certificates. Choose a shorter date range."})});
  });
  await page.getByRole("button",{name:"↓ Download Excel"}).click();
  await expect(page.getByRole("alert")).toContainText("shorter date range");
  await expect(page.getByRole("button",{name:"↓ Download Excel"})).toBeEnabled();
});
