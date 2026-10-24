import { authenticatedRequest, requestErrorResponse, RequestError } from "@/lib/auth/request";
import { serverSession } from "@/lib/auth/server-session";
import { isAccountId } from "@/lib/accounts/context";
import { logoResponse } from "@/lib/branding/server";

export async function GET(request: Request,{ params }: { params:Promise<{ assetId:string }> }) {
  try {
    const { assetId }=await params;
    let client;
    if (request.headers.has("authorization")) client=(await authenticatedRequest(request,false)).client;
    else {
      const account=new URL(request.url).searchParams.get("account");
      if (account && !isAccountId(account)) throw new RequestError("Logo unavailable.",404);
      client=await serverSession(account);
      const { data:{ user },error }=await client.auth.getUser();
      if (error || !user) throw new RequestError("Authentication required.",401);
    }
    const { data,error }=await client.rpc("cv_logo_access",{ p_asset:assetId });
    if (error || typeof data!=="string") throw new RequestError("Logo unavailable.",404);
    return await logoResponse(data,false,client);
  } catch(error) { return requestErrorResponse(error); }
}
