import {platformContext,platformError,privateJson} from "@/lib/platform/server";
import {RequestError} from "@/lib/auth/request";
export const runtime="nodejs";
export async function GET(request:Request){
  try{
    const {client}=await platformContext(request);
    const {data,error}=await client.rpc("cv_geo_admin_summary");
    if(error)throw new RequestError("Geographical analytics unavailable.",503);
    return privateJson(data);
  }catch(error){return platformError(error);}
}
