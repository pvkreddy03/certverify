import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { LOGO_BUCKET } from "@/lib/branding/types";

/** Logical sanitized branding blob store. Certificate rows store only references. */
export interface LogoObjectStorage {
  upload(path: string, normalizedWebp: Uint8Array): Promise<void>;
  download(path: string): Promise<Blob | null>;
}

export class LogoStorageUnavailable extends Error {
  constructor(){super("Logo storage is temporarily unavailable.");}
}
export class SupabaseLogoObjectStorage implements LogoObjectStorage {
  constructor(private readonly client: SupabaseClient) {}
  async upload(path:string, bytes:Uint8Array) {
    const {error}=await this.client.storage.from(LOGO_BUCKET).upload(path,bytes,{
      contentType:"image/webp",cacheControl:"31536000",upsert:false,
    });
    if(error) throw new LogoStorageUnavailable();
  }
  async download(path:string) {
    const {data,error}=await this.client.storage.from(LOGO_BUCKET).download(path);
    if(error||!data) return null;
    return data;
  }
}

export function logoObjectStorage(viewer?:SupabaseClient):LogoObjectStorage {
  const provider=process.env.CERTVERIFY_LOGO_STORAGE_PROVIDER || "supabase";
  if(provider!=="supabase") throw new LogoStorageUnavailable();
  if(viewer) return new SupabaseLogoObjectStorage(viewer);
  // Public reads use the anonymous key and Storage RLS, not a service secret.
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)throw new LogoStorageUnavailable();
  const client=createClient(url,key,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  });
  return new SupabaseLogoObjectStorage(client);
}
