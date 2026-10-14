import { NextRequest, NextResponse } from "next/server";
import { serverSession } from "@/lib/auth/server-session";
import { loginDestination } from "@/lib/auth/login-destination";

export const dynamic = "force-dynamic";

// The verified server session, not a browser-side guess or a hard-coded email,
// decides whether the customer or platform portal is the correct destination.
export async function GET(request: NextRequest) {
  const client = await serverSession();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: platformIdentity, error: identityError } = await client.rpc("cv_platform_identity");
  if (identityError || typeof platformIdentity !== "boolean") {
    return NextResponse.json(
      { error: "Account permissions could not be verified. Please refresh and sign in again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const requested = request.nextUrl.searchParams.get("next");
  const destination = loginDestination(requested, request.nextUrl.origin, platformIdentity);
  return NextResponse.redirect(new URL(destination, request.url), { headers: { "Cache-Control": "no-store" } });
}
