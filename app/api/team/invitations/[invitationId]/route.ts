import { teamAdminContext } from "@/lib/auth/team-context";
import { RequestError, requestErrorResponse } from "@/lib/auth/request";
import { POST as sendInvitation } from "@/app/api/team/invite/route";

type RouteContext = { params: Promise<{ invitationId: string }> };
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { client, accountId } = await teamAdminContext(request);
    const { invitationId } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (body.action === "revoke") {
      const { error } = await client.rpc("cv_revoke_invitation", { p_invitation_id: invitationId });
      if (error) throw new RequestError("Invitation could not be cancelled. It may already have been accepted.", 409);
      return Response.json({ success: true, message: "Invitation cancelled." });
    }
    if (body.action !== "resend") throw new RequestError("Unsupported invitation action.", 400);
    const { data, error } = await client.from("account_invitations").select("invited_email")
      .eq("id", invitationId).eq("account_id", accountId).maybeSingle();
    if (error || !data) throw new RequestError("Invitation not found in this organization.", 404);
    return sendInvitation(new Request(request.url, { method: "POST", headers: request.headers,
      body: JSON.stringify({ email: data.invited_email, previousInvitationId: invitationId }),
    }));
  } catch (error) { return requestErrorResponse(error); }
}
