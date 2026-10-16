import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const scoped = readFileSync("supabase/proposals/20261015_scoped_logo_storage.sql", "utf8");
const fixed = readFileSync("supabase/proposals/20261015_fix_restrictive_logo_policies.sql", "utf8");

test("previous restrictive Storage insert rule permits only an authenticated reserved logo", () => {
  assert.match(scoped, /cv_storage_logo_upload_allowed\(name\)/);
  assert.match(fixed, /create policy cv_branding_storage_no_insert[\s\S]*?as restrictive for insert to authenticated[\s\S]*?cv_storage_logo_upload_allowed\(name\)/i);
  assert.match(fixed, /create policy cv_branding_storage_scope[\s\S]*?as restrictive for select to authenticated[\s\S]*?cv_storage_private_logo_read\(name\)/i);
});

test("anonymous read exception is issued-only and anonymous writes stay blocked", () => {
  assert.match(scoped, /for select to anon[\s\S]*?cv_storage_public_logo_read\(name\)/i);
  assert.match(fixed, /create policy cv_branding_storage_no_anon[\s\S]*?cv_storage_public_logo_read\(name\)[\s\S]*?with check \(bucket_id <> 'certverify-branding'\)/i);
  assert.match(fixed, /create policy cv_branding_storage_no_anon_delete[\s\S]*?as restrictive for delete to anon/i);
  assert.match(scoped, /create policy cv_branding_storage_scoped_upload[\s\S]*?cv_storage_logo_upload_allowed\(name\)/i);
});
