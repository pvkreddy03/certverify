import { authenticatedRequest,requestErrorResponse,RequestError } from "@/lib/auth/request";
import { PlatformInputError } from "./validation";
export async function platformContext(request:Request) {
  const context=await authenticatedRequest(request,false);
  const { data,error }=await context.client.rpc("cv_is_platform_admin");
  if (error || data!==true) throw new RequestError("Platform administrator authorization and MFA are required.",403);
  return context;
}
export function platformError(error:unknown) {
  return error instanceof PlatformInputError ? Response.json({ error:error.message },{ status:400 }) : requestErrorResponse(error);
}
export function privateJson(data:unknown) { return Response.json(data,{ headers:{ "Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff" } }); }
