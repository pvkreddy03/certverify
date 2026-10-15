import { inflateRawSync, deflateRawSync } from "node:zlib";

export class WorkbookError extends Error {}
type ZipEntry={name:string;bytes:Buffer};
const invalid=(message:string):never=>{throw new WorkbookError(message);};
function textSafe(value:string){
  return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}
function decode(value:string){
  return value.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-f]+|#[0-9]+);/gi,(_,entity:string)=>{
    const symbols:Record<string,string>={amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
    if(symbols[entity])return symbols[entity];
    const n=entity.startsWith("#x")?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
    return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):"";
  });
}
function attribute(tag:string,key:string){
  const attrs=Array.from(tag.matchAll(/([-\w:]+)\s*=\s*(["'])(.*?)\2/g));
  return decode(attrs.find(x=>x[1]===key)?.[3]||"");
}
function safe(name:string){return !!name && !name.startsWith("/")&&!name.includes("\\")&&!name.split("/").some(x=>!x||x===".."||x===".");}
function zipRead(buf:Buffer):Map<string,Buffer>{
  if(buf.length>1024*1024||buf.length<22)return invalid("Excel file must be a genuine XLSX smaller than 1 MB.");
  let e=-1;
  for(let i=buf.length-22;i>=Math.max(0,buf.length-65557);i--)if(buf.readUInt32LE(i)===0x06054b50){e=i;break;}
  if(e<0)return invalid("Invalid XLSX file.");
  const count=buf.readUInt16LE(e+10),size=buf.readUInt32LE(e+12);let p=buf.readUInt32LE(e+16);
  if(count>150||count!==buf.readUInt16LE(e+8)||p+size>e)return invalid("Unsupported XLSX structure.");
  const files=new Map<string,Buffer>();let total=0;
  for(let i=0;i<count;i++){
    if(p+46>buf.length||buf.readUInt32LE(p)!==0x02014b50)return invalid("Invalid Excel ZIP directory.");
    const flags=buf.readUInt16LE(p+8),method=buf.readUInt16LE(p+10);
    const compressed=buf.readUInt32LE(p+20),expanded=buf.readUInt32LE(p+24);
    const n=buf.readUInt16LE(p+28),x=buf.readUInt16LE(p+30),c=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
    const name=buf.toString("utf8",p+46,p+46+n);p+=46+n+x+c;
    if(name.endsWith("/"))continue;
    if(!safe(name)||name.includes("vbaProject")||name.startsWith("xl/externalLinks/"))
      return invalid("Unsafe workbook contents or external links.");
    if(flags&1||![0,8].includes(method)||expanded>3*1024*1024||total+expanded>8*1024*1024)
      return invalid("Excel workbook is encrypted or too large.");
    total+=expanded;
    if(local+30>buf.length||buf.readUInt32LE(local)!==0x04034b50)return invalid("Invalid ZIP entry.");
    const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);
    if(start+compressed>buf.length||files.has(name))return invalid("Corrupted or duplicated ZIP entry.");
    let data:Buffer;
    try{
      const raw=buf.subarray(start,start+compressed);
      data=method===0?Buffer.from(raw):inflateRawSync(raw,{maxOutputLength:3*1024*1024+1});
    }catch{return invalid("Excel file could not be safely decompressed.");}
    if(data.length!==expanded)return invalid("Corrupt Excel worksheet.");
    files.set(name,data);
  }
  return files;
}
function xml(files:Map<string,Buffer>,name:string){
  const file=files.get(name);
  if(!file)return invalid("Missing Excel workbook component.");
  const contents=file.toString("utf8");
  if(/<!DOCTYPE|<!ENTITY/i.test(contents))return invalid("XML entities are not permitted.");
  return contents;
}
export type ImportedSheet={headers:string[];rows:string[][]};
export function readXlsx(file:Buffer):ImportedSheet{
  const files=zipRead(file);
  if(!files.has("[Content_Types].xml"))return invalid("Select an actual .xlsx file.");
  const workbook=xml(files,"xl/workbook.xml"),rels=xml(files,"xl/_rels/workbook.xml.rels");
  const sheet=workbook.match(/<sheet(?=[\s>])[^>]*\/?>/i);
  const rid=sheet?attribute(sheet[0],"r:id"):"";
  if(!rid)return invalid("Excel workbook has no worksheet.");
  let path="";
  for(const match of rels.matchAll(/<Relationship(?=[\s>])[^>]*\/?>/g)){
    if(attribute(match[0],"Id")===rid){
      const dest=attribute(match[0],"Target"),kind=attribute(match[0],"Type");
      if(!kind.endsWith("/worksheet")||attribute(match[0],"TargetMode")==="External")return invalid("Unsupported Excel worksheet.");
      path=dest.startsWith("/")?dest.slice(1):dest.startsWith("xl/")?dest:"xl/"+dest;
      break;
    }
  }
  if(!safe(path))return invalid("Missing or unsafe worksheet.");
  const worksheet=xml(files,path);
  const shared:string[]=[];
  if(files.has("xl/sharedStrings.xml")){
    for(const si of xml(files,"xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)){
      shared.push(Array.from(si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g),m=>decode(m[1])).join(""));
    }
    if(shared.length>12000)return invalid("Too many Excel shared strings.");
  }
  const rowMap=new Map<number,Map<number,string>>();
  for(const row of worksheet.matchAll(/<row(?=[\s>])([^>]*)>([\s\S]*?)<\/row>/g)){
    const rowNum=Number(attribute(row[0].slice(0,row[0].indexOf(">")+1),"r"));
    if(!Number.isInteger(rowNum)||rowNum<1||rowNum>150)return invalid("Maximum 100 certificate rows plus headers.");
    const cells=new Map<number,string>();
    for(const cell of row[2].matchAll(/<c(?=[\s>/])([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const tag="<c"+cell[1]+">",cellRef=attribute(tag,"r"),column=cellRef.match(/^([A-Z]{1,3})\d+$/i)?.[1];
      if(!column)continue;
      let idx=0;for(const chr of column.toUpperCase())idx=idx*26+chr.charCodeAt(0)-64;idx--;
      if(idx>99)return invalid("Maximum 100 columns.");
      const body=cell[2]||"",type=attribute(tag,"t");
      if(/<f(?:\s|>)/i.test(body))return invalid("Replace spreadsheet formulas with values before importing.");
      let value="";
      if(type==="inlineStr")value=Array.from(body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g),m=>decode(m[1])).join("");
      else {
        const raw=body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
        if(raw)value=decode(raw[1]);
        if(type==="s"){const num=Number(value);if(!Number.isInteger(num)||num<0||num>=shared.length)return invalid("Invalid shared string.");value=shared[num];}
        if(type==="e")return invalid("Please correct Excel cell errors.");
      }
      if(value.length>1500)return invalid("Each cell must have at most 1,500 characters.");
      cells.set(idx,value);
    }
    rowMap.set(rowNum,cells);
    if(rowMap.size>105)return invalid("Maximum 100 certificates per upload.");
  }
  const heading=rowMap.get(1);
  if(!heading?.size)return invalid("First Excel row must contain column names.");
  const headers=Array.from({length:Math.max(...heading.keys())+1},(_,i)=>(heading.get(i)||"").trim());
  if(headers.some(x=>!x)||new Set(headers.map(x=>x.toLowerCase())).size!==headers.length)
    return invalid("Excel column names must be unique and nonempty.");
  const rows=Array.from(rowMap.entries()).filter(([i])=>i>1).sort((a,b)=>a[0]-b[0])
    .map(([,cells])=>headers.map((_,i)=>cells.get(i)||"")).filter(row=>row.some(x=>x.trim()!==""));
  if(!rows.length||rows.length>100)return invalid("Upload must contain 1 to 100 filled certificate rows.");
  return {headers,rows};
}
function crc32(bytes:Buffer){let x=0xffffffff;for(const n of bytes){x^=n;for(let j=0;j<8;j++)x=(x>>>1)^((x&1)?0xedb88320:0);}return (x^0xffffffff)>>>0;}
export function zipFiles(entries:ZipEntry[]):Buffer{
  if(entries.length>120)return invalid("Too many ZIP files.");
  const localParts:Buffer[]=[],centralParts:Buffer[]=[];let offset=0;
  for(const {name,bytes} of entries){
    if(!safe(name))return invalid("Invalid ZIP filename.");
    const fileName=Buffer.from(name),packed=deflateRawSync(bytes,{level:6}),checksum=crc32(bytes);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(2048,6);
    local.writeUInt16LE(8,8);local.writeUInt32LE(checksum,14);local.writeUInt32LE(packed.length,18);
    local.writeUInt32LE(bytes.length,22);local.writeUInt16LE(fileName.length,26);
    localParts.push(local,fileName,packed);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);
    central.writeUInt16LE(20,6);central.writeUInt16LE(2048,8);central.writeUInt16LE(8,10);
    central.writeUInt32LE(checksum,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(bytes.length,24);
    central.writeUInt16LE(fileName.length,28);central.writeUInt32LE(offset,42);
    centralParts.push(central,fileName);offset+=local.length+fileName.length+packed.length;
  }
  const centrals=Buffer.concat(centralParts),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centrals.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...localParts,centrals,end]);
}
function column(i:number){let n=i+1,r="";while(n){n--;r=String.fromCharCode(65+n%26)+r;n=Math.floor(n/26);}return r;}
export function createXlsxTemplate(headers:string[]):Buffer{
  if(!headers.length||headers.length>100)return invalid("Template must have 1 to 100 columns.");
  const worksheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">'+
    headers.map((h,i)=>'<c r="'+column(i)+'1" s="1" t="inlineStr"><is><t>'+textSafe(h)+'</t></is></c>').join("")+
    '</row></sheetData></worksheet>';
  const wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Certificates" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const root='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>';
  const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  return zipFiles([
    {name:"[Content_Types].xml",bytes:Buffer.from(types)},{name:"_rels/.rels",bytes:Buffer.from(root)},
    {name:"xl/workbook.xml",bytes:Buffer.from(wb)},{name:"xl/_rels/workbook.xml.rels",bytes:Buffer.from(rels)},
    {name:"xl/styles.xml",bytes:Buffer.from(styles)},{name:"xl/worksheets/sheet1.xml",bytes:Buffer.from(worksheet)},
  ]);
}
