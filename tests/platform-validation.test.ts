import { test } from "node:test";
import assert from "node:assert/strict";
import { accessChange,accountFilters,accountId,integer,PlatformInputError } from "../lib/platform/validation";
import { loginDestination } from "../lib/auth/login-destination";
test("platform report filters are bounded and reject unknown values",()=>{
  assert.deepEqual(accountFilters(new URLSearchParams("search=%20Issuer%20&type=individual&status=suspended&subscription=unknown&page=2&limit=50")),{p_search:"Issuer",p_type:"individual",p_status:"suspended",p_subscription:"unknown",p_page:2,p_limit:50});
  for(const query of ["page=0","page=1.5","page=-1","page=1e2","limit=51","type=super_admin","status=deleted","subscription=paid_forever","search="+"x".repeat(201)]) assert.throws(()=>accountFilters(new URLSearchParams(query)),PlatformInputError);
  assert.equal(integer(null,30,90),30);assert.throws(()=>integer("91",30,90),PlatformInputError);
});
test("access changes require a bounded reason and exact safe revision",()=>{
  assert.deepEqual(accessChange({status:"suspended",reason:"  Security review  ",revision:0}),{p_status:"suspended",p_reason:"Security review",p_revision:0});
  for(const body of [null,{}, {status:"suspended",reason:" ",revision:0},{status:"deleted",reason:"Reason",revision:0},{status:"active",reason:"x".repeat(2001),revision:1},{status:"active",reason:"Reason",revision:-1},{status:"active",reason:"Reason",revision:"1"},{status:"active",reason:"Reason",revision:1.5}]) assert.throws(()=>accessChange(body),PlatformInputError);
  assert.throws(()=>accountId("../other"),PlatformInputError);
});
test("shared and platform login destinations prevent open redirects and preserve safe invitation/account links",()=>{
  const origin="https://certverify.example";const id="10000000-0000-0000-0000-000000000001";
  assert.equal(loginDestination(`/platform/accounts/${id}`,origin,true),`/platform/accounts/${id}`);
  assert.equal(loginDestination(`/platform/accounts/${id}`,origin,false),"/dashboard");
  assert.equal(loginDestination("/platform",origin,false),"/dashboard");
  assert.equal(loginDestination("/dashboard",origin,true),"/platform");
  assert.equal(loginDestination("/platform/contact",origin,true),"/platform/contact");
  assert.equal(loginDestination("/accept-invite?token=fixture",origin),"/accept-invite?token=fixture");
  assert.equal(loginDestination(null,origin,true),"/platform");
  for(const path of ["https://attacker.example/platform","//attacker.example/platform","javascript:alert(1)","/api/platform/accounts","/platform/accounts/not-a-uuid","/platform/../api/platform", "http://[malformed"]) assert.equal(loginDestination(path,origin),"/dashboard");
});
