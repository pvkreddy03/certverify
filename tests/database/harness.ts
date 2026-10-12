import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

export function createDatabaseHarness(options: { freshStaging?: boolean } = {}) {
// This suite never accepts a database URL. Every run creates a fresh container
// with no network, no published ports, and no mounted/persistent production data.
const container = `certverify-test-${randomUUID().slice(0, 8)}`;
const image = "postgres:17@sha256:2d2b8998d31037bf721cfdf764d76ba74171b4fab3431b7f72c27c56ddbdf9e3";
let started = false;
type Inventory = {
  tables: { name: string; columns: { name: string; type: string; default: string | null; nullable: string }[]; rls_enabled: boolean }[];
  constraints: { name: string; table: string; definition: string }[];
  indexes: { name: string; definition: string }[];
  policies: { name: string; table: string; command: string; roles: string[]; using: string | null; check: string | null }[];
};
function quote(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function ident(value: string) { return `"${value.replaceAll('"', '""')}"`; }
function sql(source: string, expectSuccess = true) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"], { input: source, encoding: "utf8" });
  if (expectSuccess) assert.equal(result.status, 0, result.stderr);
  return { status: result.status, out: result.stdout.trim(), error: result.stderr };
}
function concurrentSql(source: string) {
  return new Promise<{ status: number | null; out: string; error: string }>((resolve, reject) => {
    const child = spawn("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"]);
    let out = "", error = "";
    child.stdout.on("data", (data) => { out += data; });
    child.stderr.on("data", (data) => { error += data; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, out: out.trim(), error }));
    child.stdin.end(source);
  });
}
const ids = {
  owner: "00000000-0000-0000-0000-000000000001",
  member: "00000000-0000-0000-0000-000000000002",
  recipient: "00000000-0000-0000-0000-000000000003",
  other: "00000000-0000-0000-0000-000000000004",
  admin: "00000000-0000-0000-0000-000000000005",
  unconfirmed: "00000000-0000-0000-0000-000000000006",
  a: "10000000-0000-0000-0000-000000000001",
  b: "10000000-0000-0000-0000-000000000002",
  templateA: "20000000-0000-0000-0000-000000000001",
  templateB: "20000000-0000-0000-0000-000000000002",
};
function as(user: string, account: string | null, statement: string, aal = "aal1") {
  return `begin; set local role authenticated;
    set local request.jwt.claims = ${quote(JSON.stringify({ sub: user, role: "authenticated", aal }))};
    set local request.headers = ${quote(JSON.stringify(account ? { "x-certverify-account": account } : {}))};
    ${statement}; commit;`;
}
function hash(n: number) { return n.toString(16).padStart(64, "0"); }
function reserve(email: string, n: number, previous?: string, account = ids.a) {
  return sql(as(ids.owner, account, `select public.cv_prepare_invitation(${quote(email)}, ${quote(hash(n))}, ${previous ? quote(previous) : "null"})`)).out;
}
function accept(user: string, n: number, name: string | null = null) {
  return as(user, null, `select public.cv_accept_invitation(${quote(hash(n))}, ${name ? quote(name) : "null"})`);
}

async function start() {
  const result = spawnSync("docker", ["run", "-d", "--name", container, "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", image], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  started = true;
  let ready = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    // The official image starts a temporary initialization server, then shuts it
    // down. pg_isready alone can falsely identify that temporary server as ready.
    const logs = spawnSync("docker", ["logs", container], { encoding: "utf8" });
    if ((logs.stdout + logs.stderr).includes("PostgreSQL init process complete") &&
      spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"]).status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ready, true, "Isolated PostgreSQL did not finish initialization");
  if (options.freshStaging) {
    // Only managed-service schema substitutes; the real fresh baseline supplies
    // application DDL, signup, numbering and policies. No legacy helper substitutes.
    sql(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create schema storage;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text default 'synthetic-test-password',raw_user_meta_data jsonb default '{}'::jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
      grant usage on schema auth,public,storage to anon,authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
      alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to anon,authenticated;`);
    sql(readFileSync('supabase/staging/20261012_fresh_baseline.sql','utf8'));
    for (const stage of ['stage1_account_security','stage2_certificate_revocation','stage3_branding','stage4_platform_admin','stage5_billing','stage6_payments','stage7_readiness'])
      sql(readFileSync(`supabase/proposals/20261012_${stage}.sql`,'utf8'));
    return;
  }
  const inventory = JSON.parse(readFileSync("docs/supabase-live-schema-inventory.json", "utf8")) as Inventory;
  // These helper bodies are explicit TEST substitutes. The historical snapshot
  // does not contain production function bodies or triggers.
  let fixture = `create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, encrypted_password text default 'synthetic-test-password', raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
  `;
  for (const table of inventory.tables) {
    fixture += `create table public.${ident(table.name)} (${table.columns.map((column) => `${ident(column.name)} ${column.type}${column.default ? ` default ${column.default}` : ""}${column.nullable === "NO" ? " not null" : ""}`).join(",")});\n`;
    if (table.rls_enabled) fixture += `alter table public.${ident(table.name)} enable row level security;\n`;
  }
  for (const constraint of [...inventory.constraints].sort((a,b) => Number(a.definition.startsWith("FOREIGN KEY")) - Number(b.definition.startsWith("FOREIGN KEY")))) fixture += `alter table public.${ident(constraint.table)} add constraint ${ident(constraint.name)} ${constraint.definition};\n`;
  for (const index of inventory.indexes) {
    if (!inventory.constraints.some((constraint) => constraint.name === index.name)) fixture += `${index.definition};\n`;
  }
  fixture += `create function public.is_account_admin(requested_account_id uuid) returns boolean language sql stable security definer as $$
    select exists(select 1 from public.account_members where account_id=requested_account_id and user_id=auth.uid() and status='active' and role in ('owner','admin')) $$;
    create function public.is_active_account_member(requested_account_id uuid) returns boolean language sql stable security definer as $$
    select exists(select 1 from public.account_members where account_id=requested_account_id and user_id=auth.uid() and status='active') $$;
    create function public.generate_certificate_id(p_account_id uuid) returns text language sql security definer as $$ select p_account_id::text $$;
    grant usage on schema auth,public to authenticated,anon;
    grant select,insert,update,delete on all tables in schema public to authenticated;
    grant select on public.certificates,public.certificate_field_values to anon;
  `;
  for (const policy of inventory.policies) fixture += `create policy ${ident(policy.name)} on public.${ident(policy.table)} for ${policy.command} to ${policy.roles.map(ident).join(",")}${policy.using ? ` using (${policy.using})` : ""}${policy.check ? ` with check (${policy.check})` : ""};\n`;
  sql(fixture);
  sql(readFileSync("supabase/proposals/20261012_stage1_account_security.sql", "utf8"));
  sql(`insert into auth.users(id,email,email_confirmed_at) values
    ('${ids.owner}','owner@example.test',now()),('${ids.member}','member@example.test',now()),
    ('${ids.recipient}','recipient@example.test',now()),('${ids.other}','other@example.test',now()),
    ('${ids.admin}','admin@example.test',now()),('${ids.unconfirmed}','unconfirmed@example.test',null);
    insert into public.accounts(id,account_name,account_type) values ('${ids.a}','Account A','organization'),('${ids.b}','Account B','organization');
    insert into public.account_members(account_id,user_id,role,status) values
    ('${ids.a}','${ids.owner}','owner','active'),('${ids.b}','${ids.owner}','owner','active'),
    ('${ids.a}','${ids.member}','member','active'),('${ids.b}','${ids.member}','member','active'),
    ('${ids.a}','${ids.admin}','admin','active');
    insert into public.certificate_templates(id,user_id,account_id,name) values
    ('${ids.templateA}','${ids.owner}','${ids.a}','Template A'),('${ids.templateB}','${ids.owner}','${ids.b}','Template B');
    insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values
    ('${ids.member}','${ids.a}','A-1','${ids.templateA}','Active'),('${ids.member}','${ids.b}','B-1','${ids.templateB}','Active');`);
}
function close() { if (started) spawnSync("docker", ["rm", "-f", container]); }


return { start, close, sql, concurrentSql, as, ids, quote, hash, reserve, accept };
}
