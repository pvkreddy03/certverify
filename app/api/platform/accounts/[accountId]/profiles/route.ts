import { platformContext, platformError, privateJson } from "@/lib/platform/server";
import { accountId } from "@/lib/platform/validation";
import { RequestError } from "@/lib/auth/request";

export async function GET(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { client } = await platformContext(request);
    const id = accountId((await params).accountId);
    const { data, error } = await client.rpc("cv_platform_contact_profiles", { p_account: id });
    if (error) throw new RequestError("Customer profiles are unavailable or you lack platform MFA authorization.", 403);
    return privateJson({ profiles: Array.isArray(data) ? data : [] });
  } catch (error) {
    return platformError(error);
  }
}
