import { test, expect } from "@playwright/test";
test("authentication and verification pages reject framing and MIME sniffing", async ({
  request,
}) => {
  for (const path of ["/login", "/verify/fixture-certificate"]) {
    const response = await request.get(path);
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  }
});
test("protected financial errors cannot be cached and never expose gateway configuration", async ({
  request,
}) => {
  const response = await request.post("/api/payments/checkout", {
    data: { amount: 1, status: "paid" },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const body = await response.text();
  expect(body).not.toContain("rzp_");
  expect(body).not.toContain("SUPABASE_SECRET");
});
