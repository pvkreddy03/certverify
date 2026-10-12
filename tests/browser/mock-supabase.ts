// Browser-contract fixture, NOT a replacement for Supabase Auth/RLS integration.
// It listens only on loopback and has no outbound requests or production credentials.
import { createServer } from "node:http";

const a = "10000000-0000-0000-0000-000000000001";
const b = "10000000-0000-0000-0000-000000000002";
const users = {
  existing: { id: "00000000-0000-0000-0000-000000000001", email: "existing@example.test", user_metadata: { professional_name: "Existing Professional" } },
  platform: { id: "00000000-0000-0000-0000-000000000004", email: "platform@example.test", user_metadata: {} },
  new: { id: "00000000-0000-0000-0000-000000000002", email: "new@example.test", user_metadata: { professional_name: "" } },
};
function token(user: typeof users[keyof typeof users], aal="aal1") {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: "authenticated", aal })}.test-signature`;
}
function session(user: typeof users[keyof typeof users], aal="aal1") {
  return { access_token: token(user,aal), refresh_token: "browser-fixture-refresh", token_type: "bearer", expires_in: 3600, user: { ...user, aud: "authenticated", role: "authenticated", app_metadata: {}, factors: user.id===users.platform.id ? [{ id:"platform-factor",factor_type:"totp",status:"verified",friendly_name:"Test MFA" }] : [], email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" } };
}
const certificateId = "20000000-0000-0000-0000-000000000001";
const publicId = "30000000-0000-0000-0000-000000000001";
let currentStatus = "Active";
let internalReason: string | null = null;
let publicReason: string | null = null;
const revokedAt = "2026-10-12T00:00:00Z";
type Version={ id:string;account_id:string;company_name:string;professional_details:string;logo_asset_id:string|null;created_at:string;origin:string;approved_by:string|null };
const baseline:Version={ id:"40000000-0000-0000-0000-000000000001",account_id:a,company_name:"Test Issuer",professional_details:"",logo_asset_id:null,created_at:"2026-10-01T00:00:00Z",origin:"baseline",approved_by:null };
let current={ ...baseline };let versions=[current];let brandingRequests:Record<string,unknown>[]=[];
let finalizeFailure=false;let storageDeletes=0;let logoCounter=0;const logos=new Map<string,Buffer>();let logoPath="";
const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
  response.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-certverify-account,prefer,accept,range,content-profile,accept-profile");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  response.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
  const chunks:Buffer[]=[];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw=Buffer.concat(chunks);
  const body = request.headers["content-type"]?.includes("application/json") && raw.length ? JSON.parse(raw.toString()) : {};
  const url = new URL(request.url!, "http://127.0.0.1:54329");
  let subject = "";let aal="aal1";
  try { const claims=JSON.parse(Buffer.from((request.headers.authorization ?? "").split(".")[1] ?? "", "base64url").toString());subject=claims.sub;aal=claims.aal; } catch {}
  const user = subject === users.platform.id ? users.platform : subject === users.new.id ? users.new : users.existing;
  response.setHeader("Content-Type", "application/json");
  function json(value: unknown, status = 200) { response.writeHead(status).end(JSON.stringify(value)); }
  if (url.pathname === "/test/reset") { currentStatus = "Active"; internalReason = null; publicReason = null; current={...baseline};versions=[current];brandingRequests=[];logos.clear();finalizeFailure=false;storageDeletes=0;json({}); return; }
  if (url.pathname === "/test/finalize-failure") { finalizeFailure=true;json({});return; }
  if (url.pathname === "/test/storage-state") { json({ objects:logos.size,deletes:storageDeletes });return; }
  if (url.pathname === "/health") { json({ status: "fixture" }); return; }
  if (url.pathname === "/auth/v1/token") { json(session(body.email === users.platform.email ? users.platform : body.email === users.new.email ? users.new : users.existing)); return; }
  if (url.pathname === "/auth/v1/verify") {
    if (body.token_hash === "expired") { json({ code: "otp_expired", message: "Expired fixture" },403); return; }
    json(session(body.token_hash === "new" ? users.new : users.existing)); return;
  }
  if (url.pathname === "/auth/v1/user") { json({ ...session(user,aal).user, ...(body.data ? { user_metadata: body.data } : {}) }); return; }
  if (url.pathname === "/auth/v1/logout") { response.writeHead(204).end(); return; }
  if (url.pathname === "/auth/v1/recover" || url.pathname === "/auth/v1/signup") { json({}); return; }
  if (url.pathname.endsWith("/platform-factor/challenge")) { json({ id:"fixture-challenge",type:"totp",expires_at:Math.floor(Date.now()/1000)+60 });return; }
  if (url.pathname.endsWith("/platform-factor/verify")) { json(session(users.platform,"aal2"));return; }
  if (url.pathname.startsWith("/storage/v1/object/")) {
    const path=decodeURIComponent(url.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?certverify-branding\//,""));
    if (request.method==="DELETE") { storageDeletes++;json([]);return; }
    if (request.method==="POST") { logos.set(path,raw);json({ Key:path });return; }
    const bytes=logos.get(path);if (!bytes) { json({ message:"Object missing" },404);return; }
    response.setHeader("Content-Type","image/webp");response.writeHead(200).end(bytes);return;
  }
  const rpc=url.pathname.replace("/rest/v1/rpc/","");
  if (rpc==="cv_platform_identity") { json(user.id===users.platform.id);return; }
  if (rpc==="cv_is_platform_admin") { json(user.id===users.platform.id && aal==="aal2");return; }
  if (rpc==="cv_current_branding") { json(current);return; }
  if (rpc==="cv_certificate_issuer") { json(baseline);return; }
  if (rpc==="cv_reserve_logo") {
    if (user.id!==users.existing.id) { json({ message:"Denied" },403);return; }
    const id=`50000000-0000-0000-0000-${String(++logoCounter).padStart(12,"0")}`;logoPath=`${a}/${id}.webp`;json({ id,path:logoPath });return;
  }
  if (rpc==="cv_finalize_logo") { if (finalizeFailure) { json({ message:"Ambiguous finalization" },503);return; }json(true);return; }
  if (rpc==="cv_logo_access") { json(user.id!==users.new.id ? `${a}/${body.p_asset}.webp` : null);return; }
  if (rpc==="cv_public_logo_path") { json(null);return; }
  if (rpc==="cv_request_branding") {
    if (user.id!==users.existing.id || request.headers["x-certverify-account"]!==a) { json({ message:"Denied" },403);return; }
    if (brandingRequests.some((r)=>r.status==="pending")) { json({ message:"Already pending" },409);return; }
    const id="60000000-0000-0000-0000-000000000001";
    brandingRequests.push({ id,account_id:a,base_version_id:current.id,company_name:body.p_name,professional_details:body.p_details,logo_asset_id:body.p_logo,explanation:body.p_explanation,requested_by:user.id,status:"pending",created_at:new Date().toISOString() });json(id);return;
  }
  if (rpc==="cv_platform_branding_queue") {
    json(brandingRequests.map((r)=>({ request:r,current,fields:["company_name"],history:versions,permissions:[] })));return;
  }
  if (rpc==="cv_review_branding") {
    if (user.id!==users.platform.id || aal!=="aal2") { json({ message:"Denied" },403);return; }
    const r=brandingRequests.find((item)=>item.id===body.p_request);
    if (!r || r.status!=="pending") { json({ message:"Not pending" },409);return; }
    r.status=body.p_action==="approve" ? "approved" : "rejected";r.decision_reason=body.p_reason;
    if (body.p_action==="approve") { current={...current,id:"40000000-0000-0000-0000-000000000002",company_name:String(r.company_name),professional_details:String(r.professional_details),logo_asset_id:r.logo_asset_id as string|null,origin:"approved",approved_by:user.id};versions.push(current); }
    json(true);return;
  }
  if (url.pathname==="/rest/v1/cv_branding_versions") { json(versions);return; }
  if (url.pathname==="/rest/v1/cv_branding_requests") { json(user.id===users.existing.id ? brandingRequests : []);return; }
  if (url.pathname === "/rest/v1/rpc/cv_list_accounts") {
    json([{ id: a, account_name: "Organization A", account_code: "A", account_type: "organization", role: user.id === users.new.id ? "member" : "owner" },
      { id: b, account_name: "Organization B", account_code: "B", account_type: "organization", role: "member" }]); return;
  }
  if (url.pathname === "/rest/v1/rpc/cv_accept_invitation") { json(b); return; }
  if (url.pathname === "/rest/v1/rpc/cv_change_certificate_status") {
    currentStatus = body.p_status; internalReason = body.p_reason; publicReason = body.p_public_reason;
    json({ id:certificateId,status:currentStatus }); return;
  }
  if (url.pathname === "/rest/v1/rpc/cv_public_certificate") {
    if (body.p_reference === "unavailable-fixture") { json({ message:"Fixture unavailable" },503); return; }
    if (![publicId,"active-fixture","inactive-fixture","revoked-fixture"].includes(body.p_reference)) { json(null); return; }
    const status = body.p_reference === publicId ? currentStatus : body.p_reference === "revoked-fixture" ? "Revoked" : body.p_reference === "inactive-fixture" ? "Inactive" : "Active";
    json({ public_verification_id:publicId,certificate_id:"CV-FIXTURE-1",issuer_name:"Test Issuer",issued_at:"2026-10-01T00:00:00Z",status,
      revoked_at:status === "Revoked" ? revokedAt : null,public_revocation_reason:status === "Revoked" ? publicReason || "Withdrawn by issuer" : null,
      fields:[{ id:"public-field",field_name:"Public title",field_type:"text",field_value:"Public certificate record" }] }); return;
  }
  if (url.pathname === "/rest/v1/certificates" && url.searchParams.get("id") === `eq.${certificateId}`) {
    json({ id:certificateId,certificate_id:"CV-FIXTURE-1",status:currentStatus,created_at:"2026-10-01T00:00:00Z",template_id:null,template_name:"Test template",public_verification_id:publicId,
      revoked_at:currentStatus === "Revoked" ? revokedAt : null,revoked_by:users.existing.id,
      revocation_reason:internalReason,public_revocation_reason:publicReason,revocation_previous_status:currentStatus === "Revoked" ? "Active" : null }); return;
  }
  if (url.pathname.startsWith("/rest/v1/")) { response.setHeader("Content-Range", "*/0"); json([]); return; }
  json({ message: "Unsupported fixture operation" },404);
});
server.listen(54329, "127.0.0.1");
