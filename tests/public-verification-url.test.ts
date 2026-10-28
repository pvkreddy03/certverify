import { test } from "node:test";
import assert from "node:assert/strict";
import { publicVerificationUrl } from "../lib/certificates/public-verification-url";

test("public verification links use a persistent configured origin, not the protected preview origin",()=>{
  const old = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.NEXT_PUBLIC_APP_URL="https://certverify-staging.vercel.app";
    assert.equal(publicVerificationUrl("CV 001/✓","https://protected-preview.vercel.app"),
      "https://certverify-staging.vercel.app/verify/CV%20001%2F%E2%9C%93");
  } finally {
    if(old===undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL=old;
  }
});
test("local use falls back to the active host only when a public host is not configured",()=>{
  const old = process.env.NEXT_PUBLIC_APP_URL;
  try {
    delete process.env.NEXT_PUBLIC_APP_URL;
    assert.equal(publicVerificationUrl("test-1","http://127.0.0.1:3100"),
      "http://127.0.0.1:3100/verify/test-1");
    assert.throws(()=>publicVerificationUrl("test","http://untrusted-preview.example"));
  } finally {
    if(old!==undefined) process.env.NEXT_PUBLIC_APP_URL=old;
  }
});

test("independent verification domain overrides login domain without changing certificate reference",()=>{
  const oldQr=process.env.NEXT_PUBLIC_VERIFICATION_ORIGIN;
  const oldApp=process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.NEXT_PUBLIC_APP_URL="https://certverify-login.example";
    process.env.NEXT_PUBLIC_VERIFICATION_ORIGIN="https://verify.example";
    assert.equal(publicVerificationUrl("cv-test","https://preview.vercel.app"),"https://verify.example/verify/cv-test");
    for(const invalid of ["https://verify.example/path","https://verify.example?x=1","http://verify.example"])
      {process.env.NEXT_PUBLIC_VERIFICATION_ORIGIN=invalid; assert.throws(()=>publicVerificationUrl("cv-test","https://preview.vercel.app"));}
  }finally{
    if(oldQr===undefined)delete process.env.NEXT_PUBLIC_VERIFICATION_ORIGIN;else process.env.NEXT_PUBLIC_VERIFICATION_ORIGIN=oldQr;
    if(oldApp===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=oldApp;
  }
});
