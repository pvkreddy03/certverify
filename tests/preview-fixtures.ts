import { approvedStagingProject } from "../lib/hosting/isolation";
export function fixtureKey(role: string, ref = approvedStagingProject) {
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encoded({alg:"HS256",typ:"JWT"})}.${encoded({role,ref})}.fixture-signature`;
}
export const previewEnv = {
  VERCEL_ENV:"preview",VERCEL_URL:"certverify-reviewed-pvkreddy03.vercel.app",
  CERTVERIFY_DEPLOYMENT_TARGET:"isolated_sandbox",CERTVERIFY_SANDBOX_PROJECT_REF:approvedStagingProject,
  NEXT_PUBLIC_SUPABASE_URL:`https://${approvedStagingProject}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:fixtureKey("anon"),SUPABASE_SECRET_KEY:fixtureKey("service_role"),
  NEXT_PUBLIC_APP_URL:"https://certverify-reviewed-pvkreddy03.vercel.app",CERTVERIFY_RATE_LIMIT_SECRET:"x".repeat(32),
};
