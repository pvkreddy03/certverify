import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("ValuerSeal is the visible name on public and dashboard surfaces", () => {
  for (const path of [
    "app/layout.tsx",
    "app/page.tsx",
    "app/verify/[certificateId]/page.tsx",
    "components/dashboard-navigation.tsx",
    "app/platform/layout.tsx",
  ]) {
    const text = source(path);
    assert.match(text, /ValuerSeal/, path);
    assert.doesNotMatch(text, /CertVerify/, path);
  }
});

test("platform administrators have no geographic intelligence routes or navigation", () => {
  assert.equal(existsSync("app/platform/geo/page.tsx"), false);
  assert.equal(existsSync("app/api/platform/geo/route.ts"), false);
  assert.doesNotMatch(source("app/platform/page.tsx"), /\/platform\/geo|Geo intelligence/);
  assert.doesNotMatch(source("components/platform-navigation.tsx"), /\/platform\/geo|Geo intelligence/);
});

test("admin geographic RPC is removed, and admin contact profiles omit city", () => {
  const migration = source("supabase/proposals/20261106_remove_platform_geo_admin_access.sql");
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.cv_geo_admin_summary\(\)/);
  assert.match(migration, /cv_platform_contact_profiles/);
  assert.doesNotMatch(migration, /'city',p\.city/);
  assert.doesNotMatch(source("app/platform/accounts/[accountId]/page.tsx"), /profile\.city/);
});

test("valuer account reference maps keep their membership permission check", () => {
  assert.match(source("app/api/geo/references/route.ts"), /cv_can_access_reference_map/);
  assert.match(source("app/dashboard/reference-map/page.tsx"), /api\/geo\/references/);
});
