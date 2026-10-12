import { platformContext,platformError,privateJson } from "@/lib/platform/server";
import { accountId,integer } from "@/lib/platform/validation";
import { RequestError } from "@/lib/auth/request";
export async function GET(request:Request,{ params }: { params:Promise<{accountId:string}> }) {
  try {
    const { client }=await platformContext(request);
    const { data,error }=await client.rpc("cv_platform_account",{ p_account:accountId((await params).accountId),p_member_page:integer(new URL(request.url).searchParams.get("memberPage"),1) });
    if (error) throw new RequestError("Account details could not be loaded.",503);
    if (!data) throw new RequestError("Account not found.",404);
    return privateJson(data);
  } catch(error) { return platformError(error); }
}
