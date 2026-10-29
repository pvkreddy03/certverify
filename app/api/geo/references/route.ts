import {authenticatedRequest,requestErrorResponse,RequestError} from "@/lib/auth/request";
import {privateJson} from "@/lib/platform/server";
export const runtime="nodejs";
export async function GET(request:Request){
  try{
    const {client,accountId}=await authenticatedRequest(request);
    if(!accountId)throw new RequestError("Select your workspace.",400);
    const {data:allowed,error:permissionError}=await client.rpc("cv_can_access_reference_map");
    if(permissionError)throw new RequestError("Could not check Reference Map permissions.",503);
    if(allowed!==true)throw new RequestError("Reference Map permission required. Ask your organization owner to enable it in Team Management.",403);
    const {data,error}=await client.rpc("cv_geo_reference_points",{p_limit:1500});
    if(error)throw new RequestError("Valuation references are temporarily unavailable.",503);
    return privateJson({points:Array.isArray(data)?data:[]});
  }catch(error){return requestErrorResponse(error);}
}
