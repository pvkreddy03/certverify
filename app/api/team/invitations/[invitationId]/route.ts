import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { POST as sendInvitation } from "@/app/api/team/invite/route";

type RouteContext = { params: Promise<{ invitationId: string }> };

function errorJson(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function getAdminContext(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");
  if (!supabaseUrl || !anonKey) return { error: "Supabase configuration is missing.", status: 500 as const };
  if (!authorization?.startsWith("Bearer ")) return { error: "Authentication required.", status: 401 as const };

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userError } = await client.auth.getUser(authorization.slice(7).trim());
  if (userError || !user) return { error: "Your login session is invalid or expired.", status: 401 as const };

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("account_members")
    .select("account_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) return { error: "Unable to verify your active organization membership.", status: 403 as const };
  if (membership.role !== "owner" && membership.role !== "admin") return { error: "Only an organization owner or admin can manage invitations.", status: 403 as const };

  const { data: account, error: accountError } = await supabaseAdmin
    .from("accounts")
    .select("id, account_type")
    .eq("id", membership.account_id)
    .maybeSingle();

  if (accountError || !account || account.account_type !== "organization") {
    return { error: "An organization account could not be verified.", status: 403 as const };
  }

  return { user, account, client };
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await getAdminContext(request);
  if ("error" in auth && typeof auth.error === "string") {
    return errorJson(auth.error, auth.status);
  }

  const { invitationId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  const { data: invitation, error: lookupError } = await supabaseAdmin
    .from("account_invitations")
    .select("id, account_id, invited_email, status, expires_at")
    .eq("id", invitationId)
    .eq("account_id", auth.account.id)
    .maybeSingle();

  if (lookupError) {
    console.error("INVITATION ACTION LOOKUP:", lookupError);
    return errorJson("Unable to find this invitation.", 500);
  }
  if (!invitation) return errorJson("Invitation not found in your organization.", 404);
  if (invitation.status === "accepted") return errorJson("This invitation has already been accepted.", 409);

  if (action === "revoke") {
    const { error } = await supabaseAdmin
      .from("account_invitations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", invitation.id)
      .in("status", ["pending", "expired"]);

    if (error) {
      console.error("REVOKE INVITATION:", error);
      return errorJson("Unable to revoke this invitation.", 500);
    }
    return NextResponse.json({ success: true, message: "Invitation revoked." });
  }

  if (action !== "resend") return errorJson("Unsupported invitation action.", 400);

  // Retire the previous app invitation first. The new invitation gets a fresh,
  // random token and a fresh expiry; the old token will no longer be accepted.
  const { error: retireError } = await supabaseAdmin
    .from("account_invitations")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)
    .in("status", ["pending", "expired", "revoked"]);

  if (retireError) {
    console.error("RETIRE OLD INVITATION:", retireError);
    return errorJson("Unable to prepare a fresh invitation.", 500);
  }

  const origin = new URL(request.url).origin;
  const result = await sendInvitation(new Request(new URL("/api/team/invite", origin), {
    method: "POST",
    headers: {
      authorization: request.headers.get("authorization") ?? "",
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: invitation.invited_email }),
  }));

  const payload = await result.json().catch(() => ({}));
  if (!result.ok) {
    return NextResponse.json(
      { error: payload?.error || "Unable to resend this invitation." },
      { status: result.status }
    );
  }

  return NextResponse.json({
    success: true,
    message: `A fresh invitation was sent to ${invitation.invited_email}.`,
  });
}
