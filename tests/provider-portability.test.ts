import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseLogoObjectStorage, logoObjectStorage, LogoStorageUnavailable } from "../lib/providers/logo-storage";
import { publicVerificationRepository, PublicVerificationUnavailable } from "../lib/providers/public-verification";

test("unsupported storage and verification providers fail closed without touching fallback data",()=>{
  const priorLogo=process.env.CERTVERIFY_LOGO_STORAGE_PROVIDER;
  const priorPublic=process.env.CERTVERIFY_VERIFICATION_PROVIDER;
  try {
    process.env.CERTVERIFY_LOGO_STORAGE_PROVIDER="unreviewed";
    process.env.CERTVERIFY_VERIFICATION_PROVIDER="unreviewed";
    assert.throws(()=>logoObjectStorage(),LogoStorageUnavailable);
    assert.throws(()=>publicVerificationRepository(),PublicVerificationUnavailable);
  } finally {
    if(priorLogo===undefined)delete process.env.CERTVERIFY_LOGO_STORAGE_PROVIDER; else process.env.CERTVERIFY_LOGO_STORAGE_PROVIDER=priorLogo;
    if(priorPublic===undefined)delete process.env.CERTVERIFY_VERIFICATION_PROVIDER; else process.env.CERTVERIFY_VERIFICATION_PROVIDER=priorPublic;
  }
});

test("logo storage adapter sends only one immutable normalized WebP upload",async()=>{
  const events:{path:string;bytes:number;upsert?:boolean;mime?:string}[]=[];
  const client={
    storage:{from:(bucket:string)=>{
      assert.equal(bucket,"certverify-branding");
      return {
        upload:async(path:string,bytes:Uint8Array,options:{upsert:boolean;contentType:string})=>{
          events.push({path,bytes:bytes.byteLength,upsert:options.upsert,mime:options.contentType});
          return {data:{path},error:null};
        },
        download:async(path:string)=>{
          assert.equal(path,"owned/logo.webp");
          return {data:new Blob([new Uint8Array([1,2,3])],{type:"image/webp"}),error:null};
        },
      };
    }},
  } as unknown as SupabaseClient;
  const store=new SupabaseLogoObjectStorage(client);
  await store.upload("owned/logo.webp",new Uint8Array([1,2,3]));
  assert.deepEqual(events,[{path:"owned/logo.webp",bytes:3,upsert:false,mime:"image/webp"}]);
  const result=await store.download("owned/logo.webp");
  assert.equal(result?.type,"image/webp");
  assert.equal(result?.size,3);
});
