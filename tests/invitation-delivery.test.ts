import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deliverInvitation, InvitationDeliveryError } from "../lib/auth/invitation-delivery";

test("a link is sent only after reservation and the database receives only its hash", async () => {
  const events: string[] = [];
  let reservedHash = "";
  const id = await deliverInvitation({
    reserve: async (hash) => { reservedHash = hash; events.push("reserve"); return "invitation"; },
    send: async (token) => { assert.match(token, /^[0-9a-f]{64}$/); assert.equal(createHash("sha256").update(token).digest("hex"), reservedHash); events.push("send"); },
    cancel: async () => { events.push("cancel"); },
  });
  assert.equal(id, "invitation");
  assert.deepEqual(events, ["reserve", "send"]);
});
test("duplicate or racing reservation failures never send email", async () => {
  let sent = false;
  await assert.rejects(deliverInvitation({ reserve: async () => { throw new Error("pending invitation"); }, send: async () => { sent = true; }, cancel: async () => {} }));
  assert.equal(sent, false);
});
test("email failure cancels only the newly reserved invitation and hides provider details", async () => {
  const cancelled: string[] = [];
  await assert.rejects(deliverInvitation({
    reserve: async () => "new", send: async () => { throw new Error("secret provider payload"); }, cancel: async (id) => { cancelled.push(id); },
  }), (error: unknown) => error instanceof InvitationDeliveryError && !error.cleanupFailed && !error.message.includes("secret"));
  assert.deepEqual(cancelled, ["new"]);
});
test("cleanup failures are distinguishable and require administrator review", async () => {
  await assert.rejects(deliverInvitation({ reserve: async () => "new", send: async () => { throw new Error(); }, cancel: async () => { throw new Error(); } }),
    (error: unknown) => error instanceof InvitationDeliveryError && error.cleanupFailed);
});


test("provider rate limiting cancels the pending invite and communicates a retry delay", async () => {
  let cancelled = false;
  await assert.rejects(deliverInvitation({
    reserve: async () => "new",
    send: async () => { throw { code: "over_email_send_rate_limit", status: 429, message: "private provider detail" }; },
    cancel: async () => { cancelled = true; },
  }), (error: unknown) => error instanceof InvitationDeliveryError && error.rateLimited &&
    /wait a few minutes/i.test(error.message) && !error.message.includes("private provider detail"));
  assert.equal(cancelled, true);
});
