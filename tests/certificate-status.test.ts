import { test } from "node:test";
import assert from "node:assert/strict";
import { statusPresentation, validateStatusChange } from "../lib/certificates/status";

test("only Active is presented as valid; Inactive and Revoked are distinct", () => {
  assert.equal(statusPresentation("Active").title,"Certificate Verified");
  assert.equal(statusPresentation("Inactive").title,"Certificate Inactive");
  assert.equal(statusPresentation("Revoked").title,"Certificate Revoked");
  assert.equal(statusPresentation("unexpected").title,"Status Unavailable");
});
test("revocation form checks whitespace-only reasons and public/private length limits", () => {
  assert.ok(validateStatusChange("Revoked","   ",""));
  assert.ok(validateStatusChange("Revoked","r".repeat(2001),""));
  assert.ok(validateStatusChange("Revoked","reason","p".repeat(501)));
  assert.equal(validateStatusChange("Revoked","Internal reason","Public explanation"),null);
  assert.equal(validateStatusChange("Inactive","",""),null);
});
