import { platformContext,platformError,privateJson } from "@/lib/platform/server";
import { integer } from "@/lib/platform/validation";
import { RequestError } from "@/lib/auth/request";
export async function GET(request:Request) {
  try {
    const { client }=await platformContext(request);
    const { data,error }=await client.rpc("cv_platform_overview",{ p_days:integer(new URL(request.url).searchParams.get("days"),30,90) });
    if (error) throw new RequestError("Platform statistics could not be loaded.",503);
    return privateJson(data);
  } catch(error) { return platformError(error); }
}
