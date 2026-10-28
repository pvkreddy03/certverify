import {authenticatedRequest,requestErrorResponse,RequestError} from "@/lib/auth/request";
import {privateJson} from "@/lib/platform/server";
export const runtime="nodejs";
export async function GET(request:Request){
  try{
    const {client,accountId}=await authenticatedRequest(request);
    if(!accountId)throw new RequestError("Select your workspace.",400);
    const {data,error}=await client.rpc("cv_geo_reference_points",{p_limit:1500});
    if(error)throw new RequestError("Valuation references are temporarily unavailable.",503);
    return privateJson({points:Array.isArray(data)?data:[]});
  }catch(error){return requestErrorResponse(error);}
}
