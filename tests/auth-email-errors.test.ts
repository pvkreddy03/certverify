import assert from "node:assert/strict";
import { test } from "node:test";
import { explainEmailError } from "../lib/auth/email-errors";

test("recovery and invitation email rate limits yield actionable feedback", () => {
  for (const kind of ["signup", "confirmation", "recovery"] as const) {
    const message = explainEmailError({ code: "over_email_send_rate_limit", message: "Email rate limit exceeded" }, kind);
    assert.match(message, /wait a few minutes/i);
    assert.match(message, /Repeated clicks/i);
  }
});

test("recovery errors do not disclose whether the account exists", () => {
  assert.doesNotMatch(explainEmailError({ message: "User not found" }, "recovery"), /User not found/i);
});

test("email-not-confirmed error offers a new confirmation link", () => {
  assert.match(explainEmailError({ code: "email_not_confirmed" }, "confirmation"), /request a new link/i);
});
