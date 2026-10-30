import { teamAdminContext } from "@/lib/auth/team-context";
import { RequestError, requestErrorResponse } from "@/lib/auth/request";
import { applicationOrigin } from "@/lib/auth/urls";
import { deliverInvitation, InvitationDeliveryError } from "@/lib/auth/invitation-delivery";

/**
 * Invitations do not need the service-role key: the verified account owner
 * reserves a one-time invitation in our audited database RPC first.
 * Supabase Auth then emails a magic link to that specific address.
 *
 * The recipient still must prove the exact invited email and possess the
 * unguessable invite token to become a member; the RPC checks both.
 * Auth may create an unconfirmed account for a first-time recipient, but it
 * does not create a membership or grant access until invitation acceptance.
 */
export async function POST(request: Request) {
  try {
    const { client } = await teamAdminContext(request);
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new RequestError("Enter a valid email address.", 400);
    }

    const previousId = typeof body.previousInvitationId === "string" ? body.previousInvitationId : null;
    const baseUrl = applicationOrigin(request.url, {
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      vercelEnv: process.env.VERCEL_ENV,
      vercelUrl: process.env.VERCEL_URL,
      nodeEnv: process.env.NODE_ENV,
    });

    const id = await deliverInvitation({
      reserve: async (hash) => {
        const { data, error } = await client.rpc("cv_prepare_invitation", {
          p_email: email, p_token_hash: hash, p_previous_id: previousId,
        });
        if (error?.message?.includes("User seat quota exceeded"))
          throw new RequestError(
            "User seat limit reached. The organization owner must add licensed seats under Subscription, or free a seat by removing a member or pending invitation.", 409,
          );
        if (error || !data) throw new RequestError(
          "Invitation could not be created. Check for an active membership or pending invitation, then retry.", 409,
        );
        return data as string;
      },
      send: async (token, id) => {
        const { data: invitation, error } = await client.from("account_invitations")
          .select("requires_setup").eq("id", id).single();
        if (error || !invitation) throw new Error("Invitation context unavailable");
        const mode = invitation.requires_setup ? "setup" : "join";
        const redirectTo = `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}&mode=${mode}`;

        // Uniform delivery for existing and first-time users: no admin user
        // listing, no user enumeration, and no high-privilege server key.
        // The recipient is not logged in on the sender's device.
        const { error: deliveryError } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
        });
        if (deliveryError) throw deliveryError;
      },
      cancel: async (id) => {
        const { error } = await client.rpc("cv_revoke_invitation", { p_invitation_id: id });
        if (error) throw new Error("Invitation cleanup failed");
      },
    });

    return Response.json({
      success: true, invitation_id: id, message: "Invitation instructions sent.", invited_email: email,
    });
  } catch (error) {
    if (error instanceof InvitationDeliveryError) return Response.json(
      { error: error.message },
      { status: error.rateLimited && !error.cleanupFailed ? 429 : 502 },
    );
    return requestErrorResponse(error);
  }
}
