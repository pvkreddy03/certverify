import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAccount, visibleWorkspaces, isAccountId, canManageAccount, type AccountMembership } from "../lib/accounts/context";
import { applicationOrigin } from "../lib/auth/urls";

const first: AccountMembership = { id: "11111111-1111-1111-1111-111111111111", account_name: "First", account_code: "A", account_type: "organization", role: "member" };
const second: AccountMembership = { ...first, id: "22222222-2222-2222-2222-222222222222", account_name: "Second", role: "owner" };

test("switching selects only a listed active membership; stale hints fall back", () => {
  assert.equal(chooseAccount([first, second], second.id), second);
  assert.equal(chooseAccount([first], second.id), first);
  assert.equal(chooseAccount([first, second], null), second);
  assert.equal(chooseAccount([first, second], "no-longer-a-member"), second);
  assert.equal(chooseAccount([], second.id), null);
});
test("invalid account headers are rejected and member roles cannot manage teams", () => {
  for (const value of [null, "", "../admin", "11111111-1111-1111-1111-111111111111,other", {}, 123]) assert.equal(isAccountId(value), false);
  assert.equal(isAccountId(first.id), true);
  assert.equal(canManageAccount("owner"), true);
  assert.equal(canManageAccount("admin"), true);
  assert.equal(canManageAccount("member"), false);
  assert.equal(canManageAccount("viewer"), false);
});
test("email redirect origins honor preview and configured production origins", () => {
  assert.equal(applicationOrigin("https://app.example/api/invite", { appUrl: "https://certverify.example/path" }), "https://certverify.example");
  assert.equal(applicationOrigin("https://app.example", { appUrl: "https://certverify-staging.vercel.app", vercelEnv: "preview", vercelUrl: "protected-preview.vercel.app" }), "https://certverify-staging.vercel.app");
  for (const appUrl of ["javascript:alert(1)", "https://user:password@example.com", "http://untrusted.example"]) assert.throws(() => applicationOrigin("https://app.example", { appUrl }));
  assert.throws(() => applicationOrigin("https://spoofed-host.example", { nodeEnv: "production" }));
  assert.equal(applicationOrigin("https://spoofed-host.example", { nodeEnv: "production", vercelUrl: "trusted.vercel.app" }), "https://trusted.vercel.app");
});

test("freshly invited staff land in their employer workspace instead of an unlicensed personal account", () => {
  const personal: AccountMembership = { id:"33333333-3333-3333-3333-333333333333",account_name:"Personal",account_code:"P",account_type:"individual",role:"owner" };
  const employer: AccountMembership = { id:"44444444-4444-4444-4444-444444444444",account_name:"Pooja Stores",account_code:"O",account_type:"organization",role:"member" };
  assert.equal(chooseAccount([personal, employer], null),employer);
  assert.equal(chooseAccount([personal, employer], "invalid"),employer);
  // Deliberately switching back to the personal workspace remains possible.
  assert.equal(chooseAccount([personal, employer],personal.id),personal);
  assert.equal(chooseAccount([personal],null),personal);
});

test("hide only the auto-created personal placeholder when staff belong to organizations", () => {
  const emptyPersonal: AccountMembership = { id:"33333333-3333-3333-3333-333333333333", account_name:"Professional account", account_code:"PA", account_type:"individual", role:"owner" };
  const orgOne: AccountMembership = { id:"44444444-4444-4444-4444-444444444444", account_name:"PVKreddy Associates", account_code:"PVK", account_type:"organization",role:"member" };
  const orgTwo: AccountMembership = { id:"55555555-5555-5555-5555-555555555555", account_name:"Pooja Stores", account_code:"PS", account_type:"organization",role:"member" };
  assert.deepEqual(visibleWorkspaces([emptyPersonal,orgOne,orgTwo]),[orgOne,orgTwo]);
  assert.equal(chooseAccount(visibleWorkspaces([emptyPersonal,orgOne,orgTwo]),emptyPersonal.id),orgOne);
  assert.deepEqual(visibleWorkspaces([emptyPersonal]),[emptyPersonal]);
  // An intentionally named personal practice and owned organization stay visible.
  const actualPractice = { ...emptyPersonal, account_name:"My Private Valuation Practice" };
  assert.deepEqual(visibleWorkspaces([actualPractice,orgTwo]),[actualPractice,orgTwo]);
});
