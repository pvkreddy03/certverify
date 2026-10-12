export type BrandingVersion = { id: string; account_id: string; company_name: string; professional_details: string; logo_asset_id: string | null; created_at: string; created_by: string | null; approved_by: string | null };
export type BrandingRequest = { id: string; account_id: string; company_name: string; professional_details: string; logo_asset_id: string | null; explanation: string; requested_by: string; status: string; decision_reason: string | null; created_at: string };
export type BrandingPermission = { id: string; user_id: string; fields: string[]; expires_at: string; used_at: string | null; revoked_at: string | null; proposal?: Pick<BrandingVersion,"company_name" | "professional_details" | "logo_asset_id"> | null };
export type BrandingProfile = { current: BrandingVersion | null; versions: BrandingVersion[]; requests: BrandingRequest[]; permissions: BrandingPermission[]; audit: { id: string; action: string; actor_id: string; occurred_at: string; details: Record<string,unknown> }[] };
export type BrandingReview = { request: BrandingRequest; current: BrandingVersion; fields: string[]; history: BrandingVersion[]; permissions: BrandingPermission[]; audit?: BrandingProfile["audit"] };
export const LOGO_BUCKET = "certverify-branding";
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
