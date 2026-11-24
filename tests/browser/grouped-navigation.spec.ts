import { test, expect, type Page } from "@playwright/test";

async function login(page:Page,email="existing@example.test"){
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password",{exact:true}).fill("test-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
}
test.beforeEach(async({request})=>{await request.post("http://127.0.0.1:54329/test/reset");});

test("desktop navigation has direct tasks and clear optional tools",async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await login(page);
  const nav=page.getByRole("navigation",{name:"Customer dashboard pages"});
  await expect(nav.getByRole("button",{name:"Sign Out"})).toBeVisible();
  await expect(nav.getByRole("link",{name:"Create Certificate",exact:true})).toBeVisible();
  await nav.getByRole("link",{name:"My Certificates",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard\/certificates\/list$/);
  const more=nav.locator('details:has(> summary[aria-label="More"])');
  await more.locator("summary").click();
  await more.getByRole("link",{name:"Report Formats",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard\/report-formats$/);
  await nav.getByRole("link",{name:"Settings",exact:true}).click();
  const settings=page.getByRole("main");
  await expect(settings.getByRole("heading",{name:"Settings"})).toBeVisible();
  await expect(settings.getByRole("link",{name:/My Profile/})).toBeVisible();
  await expect(settings.getByRole("link",{name:/Security Options/})).toBeVisible();
  await expect(settings.getByRole("link",{name:/Organization Branding/})).toBeVisible();
  await expect(settings.getByRole("link",{name:/Letterhead & QR Placement/})).toBeVisible();
});

test("mobile menu shows the core tasks without duplicate cover-letter links",async({page})=>{
  await page.setViewportSize({width:390,height:840});
  await login(page);
  const nav=page.getByRole("navigation",{name:"Customer dashboard pages"});
  const menu=nav.locator('details:has(> summary[aria-label="Open navigation menu"])');
  await menu.locator("summary").click();
  await expect(menu.getByRole("link",{name:"My Certificates",exact:true})).toBeVisible();
  await expect(menu.getByRole("link",{name:"My Cover Letters",exact:true})).toHaveCount(1);
  await expect(menu.getByRole("link",{name:"Letterhead & QR Setup"})).toBeVisible();
  await menu.getByRole("link",{name:"My Reports",exact:true}).click();
  await expect(page).toHaveURL(/\/dashboard\/reports$/);
  await nav.getByRole("button",{name:"Sign Out"}).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("sub-users can manage security but not organization branding or billing",async({page})=>{
  await login(page,"new@example.test");
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("link",{name:/Security Options/})).toBeVisible();
  await expect(page.getByRole("link",{name:/Organization Branding/})).toHaveCount(0);
  await expect(page.getByRole("link",{name:/Subscriptions/})).toHaveCount(0);
});
