import { expect, test } from "@playwright/test";

const account = "10000000-0000-0000-0000-000000000001";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("a verified organization owner can invite a sub-user without service-role access", async ({ request }) => {
  // The fixture's service-role credential is intentionally not valid for admin
  // operations: this route must only need owner authentication and email OTP.
  const tokenReply = await request.post("http://127.0.0.1:54329/auth/v1/token", {
    data: { email: "existing@example.test" },
  });
  const { access_token } = (await tokenReply.json()) as { access_token: string };

  const response = await request.post("/api/team/invite", {
    headers: { Authorization: `Bearer ${access_token}`, "x-certverify-account": account },
    data: { email: "new-teammate@example.test" },
  });
  expect(response.status(), await response.text()).toBe(200);
  await expect(response).toBeOK();
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.invited_email).toBe("new-teammate@example.test");
  expect(data.message).toBe("Invitation instructions sent.");
});
