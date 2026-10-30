import { test, expect, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByLabel("Workspace")).toBeVisible();
}

const planId = "70000000-0000-0000-0000-000000000001";
const plan = {
  id: planId, version_id: "71000000-0000-0000-0000-000000000001",
  terms: {
    name: "Team plan", description: "Testing only", eligibility: ["individual","organization"],
    audience: "standard", billing_period: "monthly", custom_days: 30,
    price_minor: 99900, renewal_price_minor: 99900, currency: "INR",currency_exponent: 2,
    included_seats: 3, extra_seat_price_minor: 15000, max_seats: 10,
    certificate_limit: 100, trial_days: 0, visible: true, features: [],
    starts_at: null, ends_at: null,
  },
};

const subscription = {
  account_id: "10000000-0000-0000-0000-000000000001",
  account_type: "organization",can_cancel:true,can_manage:true,
  entitled:true,status:"active",trial_used:false,cancel_at_period_end:false,
  allocated_seats:3,
  period: {
    id:"90000000-0000-0000-0000-000000000001",plan_id:planId,plan_version_id:plan.version_id,
    name:"Team plan",billing_period:"monthly",starts_at:"2026-10-01T00:00:00Z",
    ends_at:"2026-11-01T00:00:00Z",licensed_seats:3,certificate_limit:100,
    certificates_created:0,remaining_certificates:100,payment_status:"waived",
  },
  requests:[],history:[],payments:[],
};

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("organization owner sees full seats, an upgrade shortcut and the new-seat quote prefilled", async ({ page }) => {
  await page.route("**/api/billing", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      status:200,contentType:"application/json",
      body:JSON.stringify({subscription,plans:[plan]}),
    });
  });
  await login(page);
  await page.goto("/dashboard/team");
  await expect(page.getByRole("region",{name:"Team seat capacity"})).toContainText("3 of 3 seats used");
  await expect(page.getByText("Seat limit reached",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"+ Add User"})).toBeDisabled();
  await page.getByRole("link",{name:"+ Add More Seats"}).click();
  await expect(page).toHaveURL(/\/dashboard\/subscription\?addSeats=1/);
  await expect(page.getByRole("heading",{name:"Add licensed team seats"})).toBeVisible();
  await expect(page.getByLabel("Licensed user seats")).toHaveValue("4");
  await expect(page.getByText(/A scheduled change does not unlock extra invitations/)).toBeVisible();
});

test("owner is informed when additional seats are scheduled but not yet active",async({page})=>{
  await page.route("**/api/billing", async route => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
      subscription:{...subscription,requests:[{
        id:"94000000-0000-0000-0000-000000000001",status:"scheduled",intent:"change",
        seats:4,quote:{},scheduled_for:"2026-11-01T00:00:00Z",
      }]},
      plans:[plan],
    })});
  });
  await login(page);
  await page.goto("/dashboard/team");
  await expect(page.getByText(/A seat change is scheduled/)).toBeVisible();
  await expect(page.getByRole("button",{name:"+ Add User"})).toBeDisabled();
});
