import { authenticatedRequest, requestErrorResponse, RequestError } from "@/lib/auth/request";
import { createXlsxTemplate } from "@/lib/bulk/xlsx";
export const runtime="nodejs";
export async function GET(request:Request){
 try {
  const {client}=await authenticatedRequest(request,false);
  const template=new URL(request.url).searchParams.get("template");
  if(!template||!/^[0-9a-f-]{36}$/i.test(template))throw new RequestError("Select a certificate template.",400);
  const {data,error}=await client.from("certificate_fields")
   .select("field_name").eq("template_id",template).order("display_order",{ascending:true});
  if(error||!data?.length)throw new RequestError("Template unavailable or has no fields.",404);
  const bytes=createXlsxTemplate(data.map(f=>f.field_name));
  return new Response(new Uint8Array(bytes),{headers:{
   "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
   "Content-Disposition":'attachment; filename="certverify-template.xlsx"',
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
 }catch(error){return requestErrorResponse(error);}
}