import QRCode from "qrcode";
import sharp from "sharp";
import { authenticatedRequest, requestErrorResponse, RequestError } from "@/lib/auth/request";
import { zipFiles } from "@/lib/bulk/xlsx";
import { publicVerificationUrl } from "@/lib/certificates/public-verification-url";
export const runtime="nodejs";
type Batch={id:string;name:string;items:{id:string;certificateId:string;publicReference:string;sourceRow:number}[]};
export async function POST(request:Request){
 try{
  const {client}=await authenticatedRequest(request);
  if(Number(request.headers.get("content-length")||0)>4096)throw new RequestError("Invalid download request.",400);
  const body=await request.json() as {batchId?:string;format?:string};
  if(!body.batchId||!/^[0-9a-f-]{36}$/i.test(body.batchId)||!["jpeg","png"].includes(body.format||"jpeg"))
    throw new RequestError("Choose a valid batch and image format.",400);
  const {data,error}=await client.rpc("cv_bulk_batch_details",{p_batch:body.batchId});
  if(error||!data)throw new RequestError("Batch unavailable to this account.",403);
  const batch=data as Batch;
  if(!batch.items.length||batch.items.length>100)throw new RequestError("Invalid batch.",400);
  const format=body.format||"jpeg";
  const entries:{name:string;bytes:Buffer}[]=[];
  const csv=['Excel row,Certificate ID,Verification URL'];
  for(const item of batch.items){
    if(!/^[0-9a-f-]{36}$/i.test(item.publicReference))throw new RequestError("Unverifiable certificate.",409);
    const url=publicVerificationUrl(item.publicReference,new URL(request.url).origin);
    const png=await QRCode.toBuffer(url,{type:"png",width:300,margin:3,errorCorrectionLevel:"M"});
    const bytes=format==="png"?png:await sharp(png).flatten({background:"#ffffff"}).jpeg({quality:90}).toBuffer();
    entries.push({name:"QR/"+String(item.sourceRow-1).padStart(3,"0")+"-"+item.id+"."+(format==="png"?"png":"jpg"),bytes});
    const escape=(s:string)=>'"'+s.replaceAll('"','""')+'"';
    csv.push([String(item.sourceRow),escape(item.certificateId),escape(url)].join(","));
  }
  entries.push({name:"certificate-list.csv",bytes:Buffer.from("\ufeff"+csv.join("\r\n"),"utf8")});
  const zip=zipFiles(entries);
  return new Response(new Uint8Array(zip),{headers:{
   "Content-Type":"application/zip",
   "Content-Disposition":'attachment; filename="certverify-bulk-qrs.zip"',
   "Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  }});
 }catch(error){return requestErrorResponse(error);}
}