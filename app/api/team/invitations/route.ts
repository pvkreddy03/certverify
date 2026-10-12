import { teamAdminContext } from "@/lib/auth/team-context";
import { RequestError, requestErrorResponse } from "@/lib/auth/request";

export async function GET(request: Request) {
  try {
    const { client, accountId } = await teamAdminContext(request);
    const { data, error } = await client.from("account_invitations")
      .select("id, invited_email, invited_role, status, expires_at, created_at, accepted_at")
      .eq("account_id", accountId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new RequestError("Unable to load invitations.", 503);
    return Response.json({ invitations: (data ?? []).map((invitation) => ({ ...invitation,
      display_status: invitation.status === "pending" && new Date(invitation.expires_at).getTime() <= Date.now() ? "expired" : invitation.status,
    })) });
  } catch (error) { return requestErrorResponse(error); }
}
