import { test } from "node:test";
import assert from "node:assert/strict";
import { displayBulkDate, normalizeBulkDate } from "../lib/bulk/date";

test("accepts Indian dates and converts them safely to database ISO format", () => {
  assert.equal(normalizeBulkDate("22/10/2026"), "2026-10-22");
  assert.equal(normalizeBulkDate("2/1/2026"), "2026-01-02");
  assert.equal(normalizeBulkDate("22-10-2026"), "2026-10-22");
  assert.equal(normalizeBulkDate("2026-10-22"), "2026-10-22");
  assert.equal(displayBulkDate("2026-10-22"), "22/10/2026");
});

test("accepts Excel numeric dates in the 1900 date system", () => {
  assert.equal(normalizeBulkDate("46022"), "2025-12-31");
  assert.equal(displayBulkDate("46022"), "31/12/2025");
});

test("invalid and ambiguous input is rejected rather than silently changing dates", () => {
  for (const input of ["31/02/2026", "02/29/2026", "2026-13-01", "22/10/26", "tomorrow", "0", "12/13/2026", ""]) {
    assert.equal(normalizeBulkDate(input), null, input);
  }
});
