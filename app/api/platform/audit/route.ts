import { platformContext,platformError,privateJson } from "@/lib/platform/server";
import { accountId,integer } from "@/lib/platform/validation";
import { RequestError } from "@/lib/auth/request";
export async function GET(request:Request) {
  try {
    const { client }=await platformContext(request);const params=new URL(request.url).searchParams;
    const { data,error }=await client.rpc("cv_platform_audit",{ p_account:params.get("account") ? accountId(params.get("account")!) : null,p_page:integer(params.get("page"),1) });
    if (error) throw new RequestError("Administrative history could not be loaded.",503);
    return privateJson(data);
  } catch(error) { return platformError(error); }
}
