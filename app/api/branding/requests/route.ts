import { authenticatedRequest, requestErrorResponse, RequestError } from "@/lib/auth/request";

export async function POST(request: Request) {
  try {
    const { client }=await authenticatedRequest(request);
    const body=await request.json();
    if (body.action==="direct") {
      // MFA and workspace ownership are enforced by this database RPC.
      // A mere "admin" label or customer-side flag is never sufficient.
      const { data,error }=await client.rpc("cv_platform_owner_branding_save",{
        p_name:body.companyName,p_details:body.professionalDetails,
        p_logo:body.logoAssetId || null,p_explanation:body.explanation || null,
      });
      if (error) {
        if (error.code==="42501" || /MFA|required|access denied/i.test(error.message)) {
          throw new RequestError("Verified Super Admin MFA and ownership of this workspace are required.",403);
        }
        throw new RequestError("Branding could not be saved. Verify the details and that the proposed logo finished uploading.",409);
      }
      return Response.json(data,{ headers:{ "Cache-Control":"private, no-store" } });
    } else if (body.action==="apply") {
      const { error }=await client.rpc("cv_apply_branding_permission",{ p_permission:body.permissionId });
      if (error) throw new RequestError("This permission is expired, unavailable or does not apply to your current account.",403);
    } else if (body.action==="information") {
      const { error }=await client.rpc("cv_branding_information",{ p_request:body.requestId,p_message:body.message });
      if (error) throw new RequestError("Information could not be supplied for this request.",409);
    } else if (body.action==="request") {
      const { data,error }=await client.rpc("cv_request_branding",{ p_name:body.companyName,p_details:body.professionalDetails,p_logo:body.logoAssetId || null,p_explanation:body.explanation });
      if (error) throw new RequestError("The branding request could not be submitted. Check your permissions, proposed logo and any existing open request.",409);
      return Response.json({ id:data });
    } else throw new RequestError("Unsupported branding action.",400);
    return Response.json({ success:true });
  } catch(error) { return requestErrorResponse(error); }
}
