// Inspect only generated client JS. Never prints values or matching content.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serverSecretValues } from "../lib/hosting/isolation";
const privateValues=serverSecretValues(process.env).filter(v=>v.length>=12);
if (!privateValues.length) throw new Error("Supply server-only secret bindings or an offline build sentinel for this check.");
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
const scripts=files('.next/static').filter(f=>f.endsWith('.js'));
if (!scripts.length) throw new Error("Build output has no client JavaScript to inspect.");
for(const path of scripts){
  const contents=readFileSync(path,'utf8');
  if(privateValues.some(v=>[v,JSON.stringify(v).slice(1,-1),encodeURIComponent(v),Buffer.from(v).toString('base64')].some(value=>contents.includes(value))))
    throw new Error("Generated client JavaScript contains a server-only secret. Publication is prohibited.");
}
console.log(`Client-secret literal scan passed for ${scripts.length} generated JavaScript files. No secret values logged.`);
