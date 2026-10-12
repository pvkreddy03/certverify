import { supabaseAdmin } from "@/lib/supabase/server";
import { teamAdminContext } from "@/lib/auth/team-context";
import { RequestError, requestErrorResponse } from "@/lib/auth/request";
import { applicationOrigin } from "@/lib/auth/urls";
import { deliverInvitation, InvitationDeliveryError } from "@/lib/auth/invitation-delivery";

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
    let existingUser: { email_confirmed_at?: string; user_metadata: Record<string, unknown> } | null = null;
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new RequestError("Unable to prepare an invitation. Please retry.", 502);
      existingUser = data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
      if (existingUser || data.users.length < 1000) break;
    }
    const id = await deliverInvitation({
      reserve: async (hash) => {
        const { data, error } = await client.rpc("cv_prepare_invitation", {
          p_email: email, p_token_hash: hash, p_previous_id: previousId,
        });
        if (error || !data) throw new RequestError("Invitation could not be created. Check for an active membership or pending invitation, then retry.", 409);
        return data as string;
      },
      send: async (token, id) => {
        const { data: invitation, error } = await client.from("account_invitations")
          .select("requires_setup").eq("id", id).single();
        if (error || !invitation) throw new Error("Invitation context unavailable");
        const mode = invitation.requires_setup ? "setup" : "join";
        const redirectTo = `${baseUrl}/accept-invite?token=${encodeURIComponent(token)}&mode=${mode}`;
        if (!existingUser) {
          const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { certverify_invitation_setup_required: true } });
          if (error) throw new Error("Invitation email failed");
        } else if (existingUser.email_confirmed_at) {
          const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
          if (error) throw new Error("Sign-in email failed");
        } else {
          const { error } = await supabaseAdmin.auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } });
          if (error) throw new Error("Confirmation email failed");
        }
      },
      cancel: async (id) => {
        const { error } = await client.rpc("cv_revoke_invitation", { p_invitation_id: id });
        if (error) throw new Error("Invitation cleanup failed");
      },
    });
    return Response.json({ success: true, invitation_id: id, message: "Invitation instructions sent.", invited_email: email });
  } catch (error) {
    if (error instanceof InvitationDeliveryError) return Response.json({ error: error.message }, { status: 502 });
    return requestErrorResponse(error);
  }
}
