import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEmail } from "../lib/auth/email-validation";

test("accepts valid email formats", () => {
  for (const email of ["user@example.com", " first.last+tag@company.co.in "]) assert.equal(isValidEmail(email), true);
});
test("rejects malformed email identifiers", () => {
  for (const email of ["", "hello", "name@", "@domain.com", "a@b", "a@.com", "a@b..com", "a..b@domain.com", "name @domain.com", "a@-invalid.com"])
    assert.equal(isValidEmail(email), false, email);
});
