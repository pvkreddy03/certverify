"use client";

import { useState } from "react";
import Image from "next/image";

/** Never display the broken-image icon or an apparently trusted blank logo.
 * A public logo is rendered only when its image route actually returns a
 * decodable asset; the existing server-side Storage policies remain private. */
export function BrandingLogo(props:{
  src:string;alt:string;size?:number;className?:string;fallback?:string;
}) {
  return <LogoContent key={props.src} {...props}/>;
}
function LogoContent({
  src, alt, size=128, className="", fallback="Logo unavailable",
}: {
  src: string;
  alt: string;
  size?: number;
  className?: string;
  fallback?: string;
}) {
  const [failed,setFailed]=useState(false);
  if (failed) return <span role="status" className={`inline-flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500 ${className}`}
    style={{minWidth:Math.min(size,128),minHeight:Math.min(size,128)}}>
      {fallback}
    </span>;
  return <Image src={src} alt={alt} width={size} height={size}
    unoptimized className={className} onError={()=>setFailed(true)}/>;
}
