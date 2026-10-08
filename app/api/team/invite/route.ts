import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/supabase/server";

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);

  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data
  );

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  try {
    /*
     * ----------------------------------------------------
     * 1. Supabase configuration
     * ----------------------------------------------------
     */

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL;

    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          error:
            "Supabase configuration is missing.",
        },
        { status: 500 }
      );
    }

    /*
     * ----------------------------------------------------
     * 2. Create user-authentication client
     * ----------------------------------------------------
     */

    const supabaseUser = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );

    /*
     * ----------------------------------------------------
     * 3. Validate Bearer token
     * ----------------------------------------------------
     */

    const authorization =
      request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const accessToken = authorization
      .replace("Bearer ", "")
      .trim();

    const {
      data: { user },
      error: userError,
    } =
      await supabaseUser.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        {
          error:
            "Invalid or expired login session.",
        },
        { status: 401 }
      );
    }

    /*
     * ----------------------------------------------------
     * 4. Read request body
     * ----------------------------------------------------
     */

    const body = await request.json();

    const invitedEmail =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (!invitedEmail) {
      return NextResponse.json(
        {
          error: "Email address is required.",
        },
        { status: 400 }
      );
    }

    /*
     * Basic email validation.
     */

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(invitedEmail)) {
      return NextResponse.json(
        {
          error:
            "Please enter a valid email address.",
        },
        { status: 400 }
      );
    }

    /*
     * ----------------------------------------------------
     * 5. Find current user's active membership
     * ----------------------------------------------------
     */

    const {
      data: membership,
      error: membershipError,
    } =
      await supabaseAdmin
        .from("account_members")
        .select(
          "id, account_id, user_id, role, status, joined_at"
        )
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("joined_at", {
          ascending: true,
        })
        .limit(1)
        .maybeSingle();

    if (membershipError) {
      console.error(
        "TEAM MEMBERSHIP ERROR:",
        membershipError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify your account membership.",
        },
        { status: 403 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        {
          error:
            "No active account membership found.",
        },
        { status: 403 }
      );
    }

    /*
     * ----------------------------------------------------
     * 6. Only Owner/Admin can invite users
     * ----------------------------------------------------
     */

    if (
      membership.role !== "owner" &&
      membership.role !== "admin"
    ) {
      return NextResponse.json(
        {
          error:
            "Only the Main Admin can invite users.",
        },
        { status: 403 }
      );
    }

    /*
     * ----------------------------------------------------
     * 7. Get account
     * ----------------------------------------------------
     */

    const {
      data: account,
      error: accountError,
    } =
      await supabaseAdmin
        .from("accounts")
        .select(
          "id, account_name, account_code, account_type"
        )
        .eq("id", membership.account_id)
        .maybeSingle();

    if (accountError) {
      console.error(
        "TEAM ACCOUNT ERROR:",
        accountError
      );

      return NextResponse.json(
        {
          error:
            "Unable to verify your organization.",
        },
        { status: 500 }
      );
    }

    if (!account) {
      return NextResponse.json(
        {
          error:
            "Your account could not be found.",
        },
        { status: 500 }
      );
    }

    /*
     * ----------------------------------------------------
     * 8. Invitations are only for organizations
     * ----------------------------------------------------
     */

    if (account.account_type !== "organization") {
      return NextResponse.json(
        {
          error:
            "Your account must be upgraded to an organization before you can invite users.",
        },
        { status: 400 }
      );
    }

    /*
     * ----------------------------------------------------
     * 9. Prevent inviting yourself
     * ----------------------------------------------------
     */

    const currentEmail =
      user.email?.trim().toLowerCase();

    if (
      currentEmail &&
      currentEmail === invitedEmail
    ) {
      return NextResponse.json(
        {
          error:
            "You cannot invite yourself.",
        },
        { status: 400 }
      );
    }

    /*
     * ----------------------------------------------------
     * 10. Check whether the email already belongs
     *     to an Auth user
     * ----------------------------------------------------
     */

    let existingAuthUser = null;

    const perPage = 1000;
    let page = 1;

    while (true) {
      const {
        data: usersPage,
        error: usersError,
      } =
        await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });

      if (usersError) {
        console.error(
          "AUTH USER LOOKUP ERROR:",
          usersError
        );

        return NextResponse.json(
          {
            error:
              "Unable to check the invited email address.",
          },
          { status: 500 }
        );
      }

      existingAuthUser =
        usersPage.users.find(
          (authUser) =>
            authUser.email?.trim().toLowerCase() ===
            invitedEmail
        ) ?? null;

      if (
        existingAuthUser ||
        usersPage.users.length < perPage
      ) {
        break;
      }

      page += 1;
    }

    /*
     * ----------------------------------------------------
     * 11. If user already exists, don't create another
     *     invitation through inviteUserByEmail.
     * ----------------------------------------------------
     */

    if (existingAuthUser) {
      const {
        data: existingMembership,
        error: existingMembershipError,
      } =
        await supabaseAdmin
          .from("account_members")
          .select(
            "id, account_id, user_id, role, status"
          )
          .eq(
            "account_id",
            membership.account_id
          )
          .eq(
            "user_id",
            existingAuthUser.id
          )
          .maybeSingle();

      if (existingMembershipError) {
        console.error(
          "EXISTING MEMBERSHIP LOOKUP ERROR:",
          existingMembershipError
        );

        return NextResponse.json(
          {
            error:
              "Unable to check whether this user is already a team member.",
          },
          { status: 500 }
        );
      }

      if (
        existingMembership &&
        existingMembership.status === "active"
      ) {
        return NextResponse.json(
          {
            error:
              "This user is already a member of your organization.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        {
          error:
            "An account already exists for this email address. Please use a different email address for a new invitation.",
        },
        { status: 400 }
      );
    }

    /*
     * ----------------------------------------------------
     * 12. Check for an existing pending invitation
     * ----------------------------------------------------
     */

    const {
      data: pendingInvitation,
      error: pendingInvitationError,
    } =
      await supabaseAdmin
        .from("account_invitations")
        .select(
          "id, invited_email, status, expires_at"
        )
        .eq(
          "account_id",
          membership.account_id
        )
        .eq(
          "invited_email",
          invitedEmail
        )
        .eq(
          "status",
          "pending"
        )
        .maybeSingle();

    if (pendingInvitationError) {
      console.error(
        "PENDING INVITATION LOOKUP ERROR:",
        pendingInvitationError
      );

      return NextResponse.json(
        {
          error:
            "Unable to check existing invitations.",
        },
        { status: 500 }
      );
    }

    if (pendingInvitation) {
      const expiresAt = new Date(
        pendingInvitation.expires_at
      );

      if (expiresAt > new Date()) {
        return NextResponse.json(
          {
            error:
              "A pending invitation already exists for this email address.",
          },
          { status: 400 }
        );
      }

      /*
       * Expired invitation can be marked expired
       * before creating a new one.
       */

      const { error: expireError } =
        await supabaseAdmin
          .from("account_invitations")
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .eq(
            "id",
            pendingInvitation.id
          );

      if (expireError) {
        console.error(
          "EXPIRED INVITATION UPDATE ERROR:",
          expireError
        );

        return NextResponse.json(
          {
            error:
              "Unable to update the expired invitation.",
          },
          { status: 500 }
        );
      }
    }

    /*
     * ----------------------------------------------------
     * 13. Create Supabase Auth invitation
     * ----------------------------------------------------
     */

    const requestUrl =
      new URL(request.url);

    const redirectTo =
      `${requestUrl.origin}/accept-invite`;

    const {
      data: invitedUserData,
      error: inviteError,
    } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(
        invitedEmail,
        {
          redirectTo,
        }
      );

    if (inviteError) {
      console.error(
        "AUTH INVITATION ERROR:",
        inviteError
      );

      return NextResponse.json(
        {
          error:
            inviteError.message ||
            "Unable to send the invitation email.",
        },
        { status: 500 }
      );
    }

    const invitedUser =
      invitedUserData.user;

    if (!invitedUser) {
      return NextResponse.json(
        {
          error:
            "Supabase did not return the invited user.",
        },
        { status: 500 }
      );
    }

    /*
     * ----------------------------------------------------
     * 14. Create hashed invitation reference
     * ----------------------------------------------------
     */

    const tokenHash =
      await sha256(invitedUser.id);

    /*
     * ----------------------------------------------------
     * 15. Create account invitation record
     * ----------------------------------------------------
     */

    const expiresAt =
      new Date(
        Date.now() +
          7 * 24 * 60 * 60 * 1000
      ).toISOString();

    const {
      error: invitationInsertError,
    } =
      await supabaseAdmin
        .from("account_invitations")
        .insert({
          account_id:
            membership.account_id,
          invited_email:
            invitedEmail,
          invited_role:
            "member",
          invited_by:
            user.id,
          token_hash:
            tokenHash,
          status:
            "pending",
          expires_at:
            expiresAt,
          invited_user_id:
            invitedUser.id,
        });

    /*
     * ----------------------------------------------------
     * 16. If DB insert fails, remove the newly-created
     *     Auth user so we don't leave an orphan account.
     * ----------------------------------------------------
     */

    if (invitationInsertError) {
      console.error(
        "INVITATION DATABASE INSERT ERROR:",
        invitationInsertError
      );

      const {
        error: deleteUserError,
      } =
        await supabaseAdmin.auth.admin.deleteUser(
          invitedUser.id
        );

      if (deleteUserError) {
        console.error(
          "ORPHAN AUTH USER CLEANUP ERROR:",
          deleteUserError
        );
      }

      return NextResponse.json(
        {
          error:
            "Invitation could not be saved. Please try again.",
        },
        { status: 500 }
      );
    }

    /*
     * ----------------------------------------------------
     * 17. Success
     * ----------------------------------------------------
     */

    return NextResponse.json({
      success: true,
      message:
        "Invitation sent successfully.",
      invited_email:
        invitedEmail,
    });
  } catch (error) {
    console.error(
      "TEAM INVITATION API ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected invitation error.",
      },
      { status: 500 }
    );
  }
}