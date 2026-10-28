import { authenticatedRequest, requestErrorResponse, RequestError } from "@/lib/auth/request";
import { readXlsxSheets, WorkbookError } from "@/lib/bulk/xlsx";
export const runtime="nodejs";
export async function POST(request:Request){
 try {
  await authenticatedRequest(request);
  if(Number(request.headers.get("content-length")||0)>1500000)throw new RequestError("Excel file is too large (1 MB maximum).",413);
  if(!request.body)throw new RequestError("Choose a valid .xlsx file.",400);
  const reader=request.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
    if(bytes>1500000){await reader.cancel();throw new RequestError("Excel file is too large.",413);}chunks.push(value);}
  const form=await new Response(Buffer.concat(chunks),{
    headers:{"Content-Type":request.headers.get("Content-Type")||""},
  }).formData();
  const file=form.get("file");
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".xlsx")||file.size>1024*1024)
    throw new RequestError("Choose an XLSX file up to 1 MB.",400);
  const sheets=readXlsxSheets(Buffer.from(await file.arrayBuffer()));
  return Response.json({sheets},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){
  if(error instanceof WorkbookError)return Response.json({error:error.message},{status:400});
  return requestErrorResponse(error);
 }
}