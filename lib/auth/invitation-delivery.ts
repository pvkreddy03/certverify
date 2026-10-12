import { createHash, randomBytes } from "node:crypto";

export type InvitationDeliveryDependencies = {
  reserve: (hash: string) => Promise<string>;
  send: (rawToken: string, id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
};

export class InvitationDeliveryError extends Error {
  constructor(public cleanupFailed: boolean) {
    super(cleanupFailed
      ? "Email delivery failed and the invitation needs administrator review."
      : "Email delivery failed. The new invitation has been cancelled; please retry.");
  }
}

export async function deliverInvitation(dependencies: InvitationDeliveryDependencies) {
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest("hex");
  // Reserve transactionally before sending. Duplicate/racing requests cannot email
  // links for invitations whose database reservation failed.
  const id = await dependencies.reserve(hash);
  try {
    await dependencies.send(token, id);
  } catch {
    let cleanupFailed = false;
    try { await dependencies.cancel(id); } catch { cleanupFailed = true; }
    throw new InvitationDeliveryError(cleanupFailed);
  }
  return id;
}
