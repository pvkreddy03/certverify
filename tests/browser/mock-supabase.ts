// Browser-contract fixture, NOT a replacement for Supabase Auth/RLS integration.
// It listens only on loopback and has no outbound requests or production credentials.
import { createServer } from "node:http";

const a = "10000000-0000-0000-0000-000000000001";
const b = "10000000-0000-0000-0000-000000000002";
const users = {
  existing: { id: "00000000-0000-0000-0000-000000000001", email: "existing@example.test", user_metadata: { professional_name: "Existing Professional" } },
  new: { id: "00000000-0000-0000-0000-000000000002", email: "new@example.test", user_metadata: { professional_name: "" } },
};
function token(user: typeof users.existing | typeof users.new) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now()/1000)+3600, role: "authenticated" })}.test-signature`;
}
function session(user: typeof users.existing | typeof users.new) {
  return { access_token: token(user), refresh_token: "browser-fixture-refresh", token_type: "bearer", expires_in: 3600, user: { ...user, aud: "authenticated", role: "authenticated", app_metadata: {}, email_confirmed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" } };
}
const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
  response.setHeader("Access-Control-Allow-Headers", "authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-certverify-account,prefer,accept,range,content-profile,accept-profile");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  response.setHeader("Access-Control-Expose-Headers", "Content-Range");
  if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
  let text = "";
  for await (const chunk of request) text += chunk;
  const body = text ? JSON.parse(text) : {};
  const url = new URL(request.url!, "http://127.0.0.1:54329");
  let subject = "";
  try { subject = JSON.parse(Buffer.from((request.headers.authorization ?? "").split(".")[1] ?? "", "base64url").toString()).sub; } catch {}
  const user = subject === users.new.id ? users.new : users.existing;
  response.setHeader("Content-Type", "application/json");
  function json(value: unknown, status = 200) { response.writeHead(status).end(JSON.stringify(value)); }
  if (url.pathname === "/health") { json({ status: "fixture" }); return; }
  if (url.pathname === "/auth/v1/token") { json(session(body.email === users.new.email ? users.new : users.existing)); return; }
  if (url.pathname === "/auth/v1/verify") {
    if (body.token_hash === "expired") { json({ code: "otp_expired", message: "Expired fixture" },403); return; }
    json(session(body.token_hash === "new" ? users.new : users.existing)); return;
  }
  if (url.pathname === "/auth/v1/user") { json({ ...session(user).user, ...(body.data ? { user_metadata: body.data } : {}) }); return; }
  if (url.pathname === "/auth/v1/logout") { response.writeHead(204).end(); return; }
  if (url.pathname === "/auth/v1/recover" || url.pathname === "/auth/v1/signup") { json({}); return; }
  if (url.pathname === "/rest/v1/rpc/cv_list_accounts") {
    json([{ id: a, account_name: "Organization A", account_code: "A", account_type: "organization", role: "owner" },
      { id: b, account_name: "Organization B", account_code: "B", account_type: "organization", role: "member" }]); return;
  }
  if (url.pathname === "/rest/v1/rpc/cv_accept_invitation") { json(b); return; }
  if (url.pathname.startsWith("/rest/v1/")) { response.setHeader("Content-Range", "*/0"); json([]); return; }
  json({ message: "Unsupported fixture operation" },404);
});
server.listen(54329, "127.0.0.1");
