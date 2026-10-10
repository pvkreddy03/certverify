import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function appBaseUrl(request: Request) {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  let createdInvitationId: string | null = null;

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonError("Supabase configuration is missing.", 500);
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return jsonError("Authentication required.", 401);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const { data: { user }, error: userError } =
      await supabaseUser.auth.getUser(authorization.slice(7).trim());

    if (userError || !user) {
      return jsonError("Your login session is invalid or expired. Please sign in again.", 401);
    }

    const body = await request.json().catch(() => ({}));
    const invitedEmail = typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitedEmail)) {
      return jsonError("Please enter a valid email address.", 400);
    }
    if (invitedEmail === user.email?.trim().toLowerCase()) {
      return jsonError("You cannot invite yourself.", 400);
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("account_members")
      .select("id, account_id, role, status")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) {
      console.error("INVITE MEMBERSHIP LOOKUP:", membershipError);
      return jsonError("Unable to verify your active organization membership.", 403);
    }
    if (membership.role !== "owner" && membership.role !== "admin") {
      return jsonError("Only an organization owner or admin can invite users.", 403);
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from("accounts")
      .select("id, account_name, account_type")
      .eq("id", membership.account_id)
      .maybeSingle();

    if (accountError || !account) {
      console.error("INVITE ACCOUNT LOOKUP:", accountError);
      return jsonError("Unable to verify your organization.", 500);
    }
    if (account.account_type !== "organization") {
      return jsonError("Upgrade to an organization account before inviting team members.", 400);
    }

    let existingAuthUser: { id: string; email?: string; email_confirmed_at?: string | null } | null = null;
    let page = 1;
    const perPage = 1000;

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) {
        console.error("INVITE AUTH LOOKUP:", error);
        return jsonError("Unable to check the invited email address.", 500);
      }

      existingAuthUser = data.users.find(
        (candidate) => candidate.email?.trim().toLowerCase() === invitedEmail
      ) as typeof existingAuthUser;

      if (existingAuthUser || data.users.length < perPage) break;
      page += 1;
    }

    if (existingAuthUser) {
      const { data: existingMembership, error } = await supabaseAdmin
        .from("account_members")
        .select("id, status")
        .eq("account_id", membership.account_id)
        .eq("user_id", existingAuthUser.id)
        .maybeSingle();

      if (error) {
        console.error("EXISTING MEMBERSHIP LOOKUP:", error);
        return jsonError("Unable to check this user's organization membership.", 500);
      }
      if (existingMembership?.status === "active") {
        return jsonError("This person is already an active member of your organization.", 409);
      }
    }

    const { data: previousPending, error: pendingError } = await supabaseAdmin
      .from("account_invitations")
      .select("id, status, expires_at")
      .eq("account_id", membership.account_id)
      .eq("invited_email", invitedEmail)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingError) {
      console.error("PENDING INVITATION LOOKUP:", pendingError);
      return jsonError("Unable to check existing invitations.", 500);
    }
    if (previousPending) {
      if (new Date(previousPending.expires_at).getTime() > Date.now()) {
        return jsonError("A pending invitation already exists. Use Resend invitation in Team → Invitations.", 409);
      }
      const { error } = await supabaseAdmin
        .from("account_invitations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", previousPending.id)
        .eq("status", "pending");
      if (error) {
        console.error("EXPIRE OLD INVITATION:", error);
        return jsonError("Could not update the expired invitation.", 500);
      }
    }

    const rawToken = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();

    const { data: invitation, error: insertError } = await supabaseAdmin
      .from("account_invitations")
      .insert({
        account_id: membership.account_id,
        invited_email: invitedEmail,
        invited_role: "member",
        invited_by: user.id,
        token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
        invited_user_id: existingAuthUser?.id ?? null,
      })
      .select("id")
      .single();

    if (insertError || !invitation) {
      console.error("CREATE INVITATION RECORD:", insertError);
      return jsonError("Could not create the invitation record. Please try again.", 500);
    }
    createdInvitationId = invitation.id;

    const baseUrl = appBaseUrl(request);
    const mode = existingAuthUser
      ? (existingAuthUser.email_confirmed_at ? "join" : "setup")
      : "setup";
    const redirectTo = `${baseUrl}/accept-invite?token=${encodeURIComponent(rawToken)}&mode=${mode}`;

    if (!existingAuthUser) {
      const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(invitedEmail, { redirectTo });
      if (error || !data.user) {
        console.error("AUTH INVITE SEND:", error);
        await supabaseAdmin.from("account_invitations").delete().eq("id", invitation.id);
        return jsonError(error?.message || "Supabase did not return the invited user.", 502);
      }

      const { error: updateError } = await supabaseAdmin
        .from("account_invitations")
        .update({ invited_user_id: data.user.id, updated_at: new Date().toISOString() })
        .eq("id", invitation.id);

      if (updateError) {
        console.error("LINK INVITED USER TO INVITATION:", updateError);
        return jsonError("The email was sent, but the invitation record needs administrator review. Do not send another invitation yet.", 500);
      }
    } else if (existingAuthUser.email_confirmed_at) {
      const { error } = await supabaseUser.auth.signInWithOtp({
        email: invitedEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });
      if (error) {
        console.error("EXISTING USER MAGIC LINK:", error);
        await supabaseAdmin.from("account_invitations")
          .update({ status: "revoked", updated_at: new Date().toISOString() })
          .eq("id", invitation.id);
        return jsonError(error.message || "Could not email a secure sign-in link to this existing user.", 502);
      }
    } else {
      const { error } = await supabaseAdmin.auth.resend({
        type: "signup",
        email: invitedEmail,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        console.error("RESEND UNCONFIRMED USER:", error);
        await supabaseAdmin.from("account_invitations")
          .update({ status: "revoked", updated_at: new Date().toISOString() })
          .eq("id", invitation.id);
        return jsonError("This email already has an unconfirmed CertVerify account, and Supabase could not resend its confirmation. Ask the person to contact the organization admin.", 502);
      }
    }

    return NextResponse.json({
      success: true,
      message: existingAuthUser
        ? `Invitation instructions sent to ${invitedEmail}. They will use their existing CertVerify account.`
        : `Invitation sent to ${invitedEmail}.`,
      invited_email: invitedEmail,
      invitation_id: invitation.id,
    });
  } catch (error) {
    console.error("TEAM INVITATION API ERROR:", error);
    if (createdInvitationId) {
      await supabaseAdmin.from("account_invitations")
        .update({ status: "revoked", updated_at: new Date().toISOString() })
        .eq("id", createdInvitationId)
        .eq("status", "pending");
    }
    return jsonError(error instanceof Error ? error.message : "Unexpected invitation error.", 500);
  }
}
