import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";

function errorJson(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

async function getAdminContext(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");
  if (!supabaseUrl || !anonKey) {
    return { error: "Supabase configuration is missing.", status: 500 as const };
  }
  if (!authorization?.startsWith("Bearer ")) {
    return { error: "Authentication required.", status: 401 as const };
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: { user }, error: userError } = await client.auth.getUser(authorization.slice(7).trim());
  if (userError || !user) {
    return { error: "Your login session is invalid or expired.", status: 401 as const };
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("account_members")
    .select("account_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return { error: "Unable to verify your active organization membership.", status: 403 as const };
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return { error: "Only an organization owner or admin can manage invitations.", status: 403 as const };
  }

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

export async function GET(request: Request) {
  const context = await getAdminContext(request);
  if ("error" in context) return errorJson(context.error, context.status);

  const { data, error } = await supabaseAdmin
    .from("account_invitations")
    .select("id, invited_email, invited_role, status, expires_at, created_at, accepted_at")
    .eq("account_id", context.account.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("LIST TEAM INVITATIONS:", error);
    return errorJson("Unable to load invitations.", 500);
  }

  const now = Date.now();
  const invitations = (data ?? []).map((invitation) => ({
    ...invitation,
    display_status: invitation.status === "pending" && new Date(invitation.expires_at).getTime() <= now
      ? "expired"
      : invitation.status,
  }));

  return NextResponse.json({ invitations });
}
