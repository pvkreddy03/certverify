import { platformContext,platformError,privateJson } from "@/lib/platform/server";
import { accountFilters } from "@/lib/platform/validation";
import { RequestError } from "@/lib/auth/request";
export async function GET(request:Request) {
  try {
    const { client }=await platformContext(request);
    const { data,error }=await client.rpc("cv_platform_accounts",accountFilters(new URL(request.url).searchParams));
    if (error) throw new RequestError("The account report could not be loaded.",503);
    return privateJson(data);
  } catch(error) { return platformError(error); }
}
