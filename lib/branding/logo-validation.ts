import sharp from "sharp";
import { createHash } from "node:crypto";
import { MAX_LOGO_BYTES } from "./types";

export class LogoValidationError extends Error {}
export async function normalizeLogo(input: Uint8Array, declaredMime: string) {
  if (!input.byteLength || input.byteLength>MAX_LOGO_BYTES) throw new LogoValidationError("Choose a logo smaller than 2 MB.");
  const buffer=Buffer.from(input);
  const detected=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png"
    : buffer[0]===255 && buffer[1]===216 && buffer[2]===255 ? "jpeg"
    : buffer.toString("ascii",0,4)==="RIFF" && buffer.toString("ascii",8,12)==="WEBP" ? "webp" : null;
  if (!detected || declaredMime!==`image/${detected}`) throw new LogoValidationError("Use a genuine PNG, JPEG or WebP image. SVG and other formats are not allowed.");
  try {
    const decoder=sharp(buffer,{ limitInputPixels:16_777_216,failOn:"error",animated:false });
    const metadata=await decoder.metadata();
    if (metadata.format!==detected || !metadata.width || !metadata.height || metadata.width>4096 || metadata.height>4096 || (metadata.pages ?? 1)>1) throw new Error("Image dimensions or animation unsupported");
    const output=await decoder.rotate().resize(1024,1024,{ fit:"inside",withoutEnlargement:true }).webp({ quality:85 }).toBuffer();
    if (output.byteLength>MAX_LOGO_BYTES) throw new Error("Encoded logo too large");
    return { bytes:output,mime:"image/webp",hash:createHash("sha256").update(output).digest("hex") };
  } catch { throw new LogoValidationError("The logo could not be safely processed. Use a static image up to 4096 × 4096 pixels."); }
}
