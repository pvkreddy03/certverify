import { publicVerificationRepository } from "@/lib/providers/public-verification";
import { logoResponse } from "@/lib/branding/server";
import { requestErrorResponse, RequestError } from "@/lib/auth/request";

export async function GET(_request: Request,{ params }: { params:Promise<{ reference:string }> }) {
  try {
    const { reference }=await params;
    const path=await publicVerificationRepository().findLogoPath(reference);
    if (!path) throw new RequestError("Logo unavailable.",404);
    return await logoResponse(path,true);
  } catch(error) { return requestErrorResponse(error); }
}
