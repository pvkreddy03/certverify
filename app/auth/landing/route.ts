import { NextRequest } from "next/server";
import { serverSession } from "@/lib/auth/server-session";
import { loginDestination } from "@/lib/auth/login-destination";

export const dynamic = "force-dynamic";

// Relative HTTP Location headers preserve the visitor's actual hostname.
// Creating an absolute redirect from request.url can replace 127.0.0.1
// with localhost (or a proxy's internal hostname), losing auth cookies.
function localRedirect(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: path, "Cache-Control": "private, no-store" },
  });
}

// Only verified server-side identity determines the portal. No email-based
// shortcuts and no requirement to complete MFA merely to choose a landing page.
export async function GET(request: NextRequest) {
  const client = await serverSession();
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return localRedirect("/login");

  const { data: platformIdentity, error: identityError } = await client.rpc("cv_platform_identity");
  if (identityError || typeof platformIdentity !== "boolean") {
    return Response.json(
      { error: "Account permissions could not be verified. Please refresh and sign in again." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const requested = request.nextUrl.searchParams.get("next");
  const destination = loginDestination(requested, request.nextUrl.origin, platformIdentity);
  return localRedirect(destination);
}
