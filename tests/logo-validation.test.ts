import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeLogo, LogoValidationError } from "../lib/branding/logo-validation";
import { MAX_LOGO_BYTES } from "../lib/branding/types";

test("static PNG/JPEG/WebP are normalized once to bounded metadata-free WebP",async()=>{
  for (const format of ["png","jpeg","webp"] as const) {
    const original=await sharp({ create:{ width:1600,height:800,channels:3,background:"#336699" } }).toFormat(format).toBuffer();
    const result=await normalizeLogo(original,`image/${format}`);
    const metadata=await sharp(result.bytes).metadata();
    assert.equal(metadata.format,"webp");assert.ok(metadata.width!<=1024);assert.ok(metadata.height!<=1024);
    assert.equal(metadata.exif,undefined);assert.equal(result.mime,"image/webp");assert.match(result.hash,/^[a-f0-9]{64}$/);
    assert.ok(result.bytes.length<MAX_LOGO_BYTES);
  }
});
test("forged MIME types, SVG and unsupported payloads are rejected",async()=>{
  const png=await sharp({ create:{ width:4,height:4,channels:3,background:"white" } }).png().toBuffer();
  await assert.rejects(normalizeLogo(png,"image/jpeg"),LogoValidationError);
  await assert.rejects(normalizeLogo(Buffer.from('<svg onload="alert(1)"></svg>'),"image/svg+xml"),LogoValidationError);
  await assert.rejects(normalizeLogo(Buffer.from("not an image"),"image/png"),LogoValidationError);
});
test("oversized, truncated and excessive-dimension images fail before storage",async()=>{
  await assert.rejects(normalizeLogo(new Uint8Array(MAX_LOGO_BYTES+1),"image/png"),LogoValidationError);
  await assert.rejects(normalizeLogo(Buffer.from([137,80,78,71,13,10,26,10,0]),"image/png"),LogoValidationError);
  const wide=await sharp({ create:{ width:4097,height:1,channels:3,background:"white" } }).png().toBuffer();
  await assert.rejects(normalizeLogo(wide,"image/png"),LogoValidationError);
});
