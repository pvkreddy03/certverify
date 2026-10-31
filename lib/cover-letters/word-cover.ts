"use client";

import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";
import { publicVerificationUrl } from "@/lib/certificates/public-verification-url";
import { validatePlacement, type CoverPlacement } from "@/lib/cover-letters/generator";
import { previewFirstPage, type DocumentKind } from "@/lib/cover-letters/native-documents";
import { packageWordParts, downloadReport } from "@/lib/reports/docx-visual";

const encoder = new TextEncoder();

export async function plainLetterheadPdf(): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.addPage([595.28, 841.89]);
  return new Blob([(await pdf.save()).slice().buffer as ArrayBuffer], { type: "application/pdf" });
}
function escapeXml(text: string) {
  return text.replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&apos;" })[c] ?? c);
}
function makeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve,reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to render verification QR."));
    image.src = src;
  });
}
async function letterheadWithQR(args:{
  background: Blob|null; kind: DocumentKind|null;
  verificationId: string; placement: CoverPlacement;
}): Promise<Uint8Array> {
  validatePlacement(args.placement);
  const source = args.background && args.kind ? await previewFirstPage(args.background,args.kind) : null;
  const canvas = document.createElement("canvas");
  canvas.width = 1240; canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Document rendering is unavailable.");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,canvas.width,canvas.height);
  if (source) ctx.drawImage(source,0,0,canvas.width,canvas.height);
  const size=Math.round(args.placement.qr_size*canvas.width);
  const x=Math.round(args.placement.qr_x*canvas.width);
  const y=Math.round(args.placement.qr_y*canvas.height);
  const image=await makeImage(await QRCode.toDataURL(
    publicVerificationUrl(args.verificationId,window.location.origin),
    {width:900,margin:2,errorCorrectionLevel:"M"}));
  ctx.fillStyle="#ffffff";ctx.fillRect(x,y,size,size);ctx.drawImage(image,x,y,size,size);
  const binary=atob(canvas.toDataURL("image/jpeg",.93).split(",")[1]);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}

/** The saved letterhead image and QR are precisely positioned on A4 behind
 * editable Word letter text. No document is persisted per certificate.
 * For PDF/DOCX uploads only the visible first page is used as the background.
 */
export async function createWordCoverLetter(args:{
  background:Blob|null;kind:DocumentKind|null;verificationId:string;
  body:string;placement:CoverPlacement;
}):Promise<Blob> {
  const jpeg=await letterheadWithQR(args);
  const p=args.placement;
  const bodyRuns=args.body.split(/\r?\n/).map((line,i)=>
    (i?"<w:br/>":"")+'<w:t xml:space="preserve">'+escapeXml(line)+"</w:t>").join("");
  const paragraphs=args.body.trim()
    ? '<w:p><w:pPr><w:spacing w:before="'+Math.round(p.text_y*16838)+
      '" w:after="0" w:line="300" w:lineRule="auto"/><w:ind w:left="'+
      Math.round(p.text_x*11906)+'" w:right="'+
      Math.round((1-p.text_x-p.text_width)*11906)+
      '"/></w:pPr><w:r><w:rPr><w:sz w:val="21"/></w:rPr>'+bodyRuns+"</w:r></w:p>"
    : "<w:p/>";
  const doc=[
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>',
    paragraphs,
    '<w:sectPr><w:headerReference w:type="default" r:id="rId1"/>',
    '<w:pgSz w:w="11906" w:h="16838"/>',
    '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>',
    '</w:sectPr></w:body></w:document>'
  ].join("");
  const header=[
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:p><w:r><w:drawing>',
    '<wp:anchor xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    ' distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1"',
    ' locked="0" layoutInCell="1" allowOverlap="1">',
    '<wp:simplePos x="0" y="0"/>',
    '<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>',
    '<wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>',
    '<wp:extent cx="7560000" cy="10692000"/>',
    '<wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>',
    '<wp:docPr id="1" name="Letterhead with verification QR"/><wp:cNvGraphicFramePr/>',
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="letterhead.jpg"/><pic:cNvPicPr/></pic:nvPicPr>',
    '<pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>',
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="7560000" cy="10692000"/></a:xfrm>',
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>',
    '</pic:pic></a:graphicData></a:graphic>',
    '</wp:anchor></w:drawing></w:r></w:p></w:hdr>'
  ].join("");
  const relsStart='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
  const relsEnd="</Relationships>";
  const parts=[
    ["[Content_Types].xml",[
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
      '<Default Extension="xml" ContentType="application/xml"/>',
      '<Default Extension="jpg" ContentType="image/jpeg"/>',
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
      '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>',
      '</Types>'
    ].join("")],
    ["_rels/.rels",relsStart+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'+relsEnd],
    ["word/document.xml",doc],
    ["word/_rels/document.xml.rels",relsStart+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>'+relsEnd],
    ["word/header1.xml",header],
    ["word/_rels/header1.xml.rels",relsStart+'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/letterhead.jpg"/>'+relsEnd],
  ];
  return packageWordParts([
    ...parts.map(part=>({name:part[0],bytes:encoder.encode(part[1])})),
    {name:"word/media/letterhead.jpg",bytes:jpeg},
  ]);
}
export function downloadWordCover(blob:Blob,filename:string){
  downloadReport(blob,filename.replace(/\.docx$/i,"")+".docx");
}
