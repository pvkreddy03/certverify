import { platformBrandingContext } from "@/lib/branding/server";
import { integer,PlatformInputError } from "@/lib/platform/validation";
import { RequestError, requestErrorResponse } from "@/lib/auth/request";

export async function GET(request: Request) {
  try {
    const { client }=await platformBrandingContext(request);
    const params=new URL(request.url).searchParams;const status=params.get("status") || null;
    if (status && !["open","pending","needs_information","permission_granted","approved","rejected","cancelled"].includes(status)) throw new RequestError("Invalid branding filter.",400);
    const { data,error }=await client.rpc("cv_platform_branding_requests",{ p_status:status,p_page:integer(params.get("page"),1),p_limit:25 });
    if (error) throw new RequestError("The branding review queue could not be loaded.",503);
    return Response.json(data,{ headers:{ "Cache-Control":"private, no-store" } });
  } catch(error) { return error instanceof PlatformInputError ? Response.json({error:error.message},{status:400}) : requestErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { client }=await platformBrandingContext(request);
    const body=await request.json();
    const result=body.action==="revoke_permission"
      ? await client.rpc("cv_revoke_branding_permission",{ p_permission:body.permissionId })
      : await client.rpc("cv_review_branding",{ p_request:body.requestId,p_action:body.action,p_reason:body.reason || null,
          p_user:body.userId || null,p_fields:body.fields || null,p_expires:body.expiresAt || null });
    if (result.error) throw new RequestError("The review could not be applied. Refresh the request and verify its status, scope and permission recipient.",409);
    return Response.json({ success:true });
  } catch(error) { return requestErrorResponse(error); }
}
