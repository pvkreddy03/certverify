import {test,expect,type Page} from "@playwright/test";
const account="10000000-0000-0000-0000-000000000001";
function token(subject="00000000-0000-0000-0000-000000000004",aal="aal2"){
  const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({alg:"HS256",typ:"JWT"})}.${encode({sub:subject,role:"authenticated",aal,exp:Math.floor(Date.now()/1000)+3600})}.fixture`;
}
async function signIn(page:Page,platform=true){
  await page.goto(platform ? "/platform-login" : "/login");await page.getByLabel("Email address").fill(platform ? "platform@example.test" : "existing@example.test");await page.getByLabel("Password",{exact:true}).fill("test-password");await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page).not.toHaveURL(/login/);
}
async function verify(page:Page){await page.getByLabel("Authenticator code").fill("123456");await page.getByRole("button",{name:"Verify MFA",exact:true}).click();await expect(page.getByRole("heading",{name:"Platform MFA verification"})).toHaveCount(0);}
test.beforeEach(async({request})=>{await request.post("http://127.0.0.1:54329/test/reset");});
test("dedicated platform login preserves navigation and MFA gates dashboard data",async({page})=>{
  await page.goto("/platform/accounts");await expect(page).toHaveURL(/\/platform-login\?next=/);
  await expect(page.getByRole("heading",{name:"Platform administrator sign in"})).toBeVisible();
  await page.getByLabel("Email address").fill("platform@example.test");await page.getByLabel("Password",{exact:true}).fill("test-password");await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/platform\/accounts$/);await expect(page.getByRole("heading",{name:"Platform MFA verification"})).toBeVisible();
  await page.getByLabel("Authenticator code").fill("000000");await page.getByRole("button",{name:"Verify MFA",exact:true}).click();await expect(page.getByRole("status")).toContainText("could not be verified");
  await verify(page);await expect(page.getByText("2 matching accounts",{exact:true})).toBeVisible();
  await page.getByRole("link",{name:"Overview",exact:true}).click();await expect(page.getByRole("heading",{name:"Registered accounts",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Total registered users",exact:true})).toBeVisible();await expect(page.getByText("unknown: 1",{exact:true})).toBeVisible();
});
test("organization owner cannot view platform dashboard or call platform APIs",async({page,request})=>{
  await signIn(page,false);await expect(page.getByLabel("Current account")).toBeVisible();await page.goto("/platform");await expect(page).toHaveURL(/\/dashboard$/);
  const anonymous=await request.get("/api/platform/overview");expect(anonymous.status()).toBe(401);
  for(const bearer of [token("00000000-0000-0000-0000-000000000001"),token(undefined,"aal1")]){
    const denied=await request.get("/api/platform/accounts",{headers:{Authorization:`Bearer ${bearer}`}});expect(denied.status()).toBe(403);
    const change=await request.post(`/api/platform/accounts/${account}/access`,{headers:{Authorization:`Bearer ${bearer}`},data:{status:"suspended",reason:"Attempted bypass",revision:0}});expect(change.status()).toBe(403);
  }
});
test("search/filter and account inspection show memberships and metadata-only activity",async({page})=>{
  await signIn(page);await verify(page);await page.getByRole("link",{name:"Accounts",exact:true}).click();
  await page.getByLabel("Search accounts").fill("Test Issuer");await page.getByRole("combobox",{name:"Account type",exact:true}).selectOption("organization");await page.getByRole("button",{name:"Apply filters"}).click();
  await expect(page.getByText("1 matching accounts",{exact:true})).toBeVisible();await page.getByRole("link",{name:"Test Issuer",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Organization and account memberships"})).toBeVisible();await expect(page.getByRole("cell",{name:"existing@example.test"})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Recent account activity"})).toBeVisible();await expect(page.getByText("Subscription: unknown",{exact:true})).toBeVisible();
});
test("suspension and restoration require reasons, preserve verification and allow another tenant",async({page,browser})=>{
  await signIn(page);await verify(page);await page.goto(`/platform/accounts/${account}`);
  const customerContext=await browser.newContext();const customer=await customerContext.newPage();await signIn(customer,false);await expect(customer.getByLabel("Current account")).toBeVisible();
  await page.getByLabel("Mandatory reason").fill("Security investigation completed before access review");await page.getByRole("button",{name:"Review access change"}).click();await page.getByRole("button",{name:"Confirm access change"}).click();
  await expect(page.getByRole("status")).toContainText("audit evidence recorded");await customer.reload();await expect(customer.getByRole("heading",{name:"Account access suspended"})).toBeVisible();
  await customer.getByLabel("Current account").selectOption("10000000-0000-0000-0000-000000000002");await expect(customer.getByRole("heading",{name:"Account access suspended"})).toHaveCount(0);await expect(customer.getByLabel("Current account")).toHaveValue("10000000-0000-0000-0000-000000000002");
  await customer.goto("/verify/active-fixture");await expect(customer.getByRole("heading",{name:"Certificate Verified",exact:true})).toBeVisible();
  await page.getByLabel("New access status").selectOption("active");await page.getByLabel("Mandatory reason").fill("Access restored after verified review");await page.getByRole("button",{name:"Review access change"}).click();await page.getByRole("button",{name:"Confirm access change"}).click();await expect(page.getByRole("status")).toContainText("audit evidence recorded");
  await customer.goto("/dashboard");await customer.getByLabel("Current account").selectOption(account);await expect(customer.getByLabel("Current account")).toHaveValue(account);await expect(customer.getByRole("heading",{name:"Account access suspended"})).toHaveCount(0);
  await page.getByRole("link",{name:"View immutable administrative history"}).click();await expect(page.getByText("Reason: Access restored after verified review",{exact:true})).toBeVisible();await customerContext.close();
});
test("MFA-authorized APIs reject malformed filters and stale or reasonless access changes",async({request})=>{
  const headers={Authorization:`Bearer ${token()}`};
  const report=await request.get("/api/platform/overview",{headers});expect(report.status()).toBe(200);expect(report.headers()["cache-control"]).toContain("no-store");
  for(const query of ["limit=51","status=deleted","page=0"]){expect((await request.get(`/api/platform/accounts?${query}`,{headers})).status()).toBe(400);}
  expect((await request.post(`/api/platform/accounts/${account}/access`,{headers,data:{status:"suspended",reason:" ",revision:0}})).status()).toBe(400);
  expect((await request.post(`/api/platform/accounts/${account}/access`,{headers,data:{status:"suspended",reason:"Review",revision:0}})).status()).toBe(200);
  expect((await request.post(`/api/platform/accounts/${account}/access`,{headers,data:{status:"active",reason:"Stale restore",revision:0}})).status()).toBe(409);
});
test("branding approvals and temporary permission revocation remain reachable from platform navigation",async({page,browser})=>{
  const ownerContext=await browser.newContext();const owner=await ownerContext.newPage();await signIn(owner,false);await expect(owner.getByLabel("Current account")).toBeVisible();await owner.goto("/dashboard/branding");
  await owner.getByLabel("Company or professional name").fill("Stage Four Issuer");await owner.getByRole("button",{name:"Submit for approval"}).click();await expect(owner.getByRole("status")).toContainText("submitted for Super Admin approval");
  await signIn(page);await verify(page);await page.getByRole("link",{name:"Branding approvals",exact:true}).click();await page.getByRole("button",{name:"Grant scoped 24-hour permission"}).click();await expect(page.getByRole("button",{name:"Revoke editing permission"})).toBeVisible();
  await page.getByRole("button",{name:"Revoke editing permission"}).click();await expect(page.getByRole("button",{name:"Approve branding"})).toBeVisible();await page.getByRole("button",{name:"Approve branding"}).click();await expect(page.getByRole("heading",{name:/Stage Four Issuer — approved/})).toBeVisible();await ownerContext.close();
});
