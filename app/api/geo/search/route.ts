import {authenticatedRequest,requestErrorResponse,RequestError} from "@/lib/auth/request";
import {privateJson} from "@/lib/platform/server";
export const runtime="nodejs";
export async function GET(request:Request){
  try{
    const {client,accountId}=await authenticatedRequest(request);
    if(!accountId)throw new RequestError("Select your workspace.",400);
    const query=new URL(request.url).searchParams.get("q")?.trim()??"";
    if(query.length<2||query.length>100||/[\r\n<>]/.test(query))
      throw new RequestError("Enter an area or locality, between 2 and 100 characters.",400);
    const {data:allowed,error}=await client.rpc("cv_geo_reserve_search");
    if(error)throw new RequestError("Place search is temporarily unavailable.",503);
    if(allowed!==true)throw new RequestError("Another location search is running. Try again in a moment.",429);
    const response=await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q="+encodeURIComponent(query),{
      headers:{"User-Agent":"CertVerify/1.0 (https://certverify-staging.vercel.app; contact: pvkreddy03@gmail.com)","Accept":"application/json","Accept-Language":"en"},
      cache:"no-store",signal:AbortSignal.timeout(8000),
    });
    if(!response.ok)throw new RequestError("Map search provider is temporarily unavailable. Pin a location manually.",503);
    const data=await response.json() as Array<{lat?:string;lon?:string;display_name?:string}>;
    const place=data[0],lat=Number(place?.lat),lng=Number(place?.lon);
    if(!place||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)
      throw new RequestError("That place was not found. Try a nearby town or landmark.",404);
    return privateJson({lat,lng,label:String(place.display_name??query).slice(0,200),approximate:true});
  }catch(error){
    return error instanceof RequestError?requestErrorResponse(error):requestErrorResponse(new RequestError("Location search unavailable. You can still pin manually.",503));
  }
}
