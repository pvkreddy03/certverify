import { platformContext,platformError,privateJson } from "@/lib/platform/server";
import { accountId,accessChange,PlatformInputError } from "@/lib/platform/validation";
import { RequestError } from "@/lib/auth/request";
export async function POST(request:Request,{ params }: { params:Promise<{accountId:string}> }) {
  try {
    const { client }=await platformContext(request);
    let body:unknown;try { body=await request.json(); } catch { throw new PlatformInputError("A valid access change is required."); }
    const { data,error }=await client.rpc("cv_platform_set_account_access",{ p_account:accountId((await params).accountId),...accessChange(body) });
    if (error) throw new RequestError("Access was not changed. Refresh the account and verify its current state before trying again.",409);
    return privateJson(data);
  } catch(error) { return platformError(error); }
}
