import { authenticatedRequest, requestErrorResponse, RequestError } from "@/lib/auth/request";

export async function GET(request: Request) {
  try {
    const { client,accountId,user }=await authenticatedRequest(request);
    const [current,versions,requests,permissions,audit]=await Promise.all([
      client.rpc("cv_current_branding"),
      client.from("cv_branding_versions").select("*").eq("account_id",accountId).order("created_at"),
      client.from("cv_branding_requests").select("*").eq("account_id",accountId).order("created_at",{ ascending:false }),
      client.from("cv_branding_permissions").select("*").eq("account_id",accountId).eq("user_id",user.id),
      client.from("cv_audit_events").select("id,action,actor_id,occurred_at,details").eq("account_id",accountId).like("action","branding.%").order("occurred_at",{ ascending:false }),
    ]);
    if ([current,versions,requests,permissions,audit].some((result)=>result.error)) throw new RequestError("Branding could not be loaded.",503);
    const scoped=await Promise.all((permissions.data ?? []).map(async(permission)=>{
      const { data }=await client.rpc("cv_permission_proposal",{ p_permission:permission.id });
      return { ...permission,proposal:data };
    }));
    return Response.json({ current:current.data,versions:versions.data,requests:requests.data,permissions:scoped,audit:audit.data },{ headers:{ "Cache-Control":"private, no-store" } });
  } catch(error) { return requestErrorResponse(error); }
}
