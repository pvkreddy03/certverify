import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

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
function as(user: string, account: string | null, statement: string) {
  return `begin; set local role authenticated;
    set local request.jwt.claims = ${quote(JSON.stringify({ sub: user, role: "authenticated" }))};
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

before(async () => {
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
});
after(() => { if (started) spawnSync("docker", ["rm", "-f", container]); });

test("membership discovery lists both organizations without relying on oldest membership", () => {
  assert.equal(sql(as(ids.member, null, "select count(*) from public.cv_list_accounts()")).out, "2");
});
test("selected organization isolates private certificates and shared templates", () => {
  assert.equal(sql(as(ids.member, ids.a, "select certificate_id from public.certificates")).out, "A-1");
  assert.equal(sql(as(ids.member, ids.b, "select certificate_id from public.certificates")).out, "B-1");
  assert.equal(sql(as(ids.member, ids.a, "select name from public.certificate_templates")).out, "Template A");
});
test("missing or forged organization context fails closed", () => {
  assert.equal(sql(as(ids.member, null, "select count(*) from public.certificates")).out, "0");
  assert.equal(sql(as(ids.other, ids.a, "select count(*) from public.certificate_templates")).out, "0");
  assert.equal(sql(as(ids.member, "invalid", "select count(*) from public.certificates")).out, "0");
});
test("members cannot modify templates or directly grant themselves privileges", () => {
  assert.equal(sql(as(ids.member, ids.a, `update public.certificate_templates set name='Unauthorized' returning id`)).out, "");
  assert.equal(sql(as(ids.member, ids.a, `update public.account_members set role='owner' where user_id='${ids.member}' returning id`)).out, "");
  assert.notEqual(sql(as(ids.member, ids.a, `select public.cv_manage_member((select id from public.account_members where user_id='${ids.admin}'),'member',false)`), false).status, 0);
});

test("administrators cannot grant admin roles or change the owner", () => {
  const memberId = sql(`select id from public.account_members where user_id='${ids.member}' and account_id='${ids.a}'`).out;
  const ownerId = sql(`select id from public.account_members where user_id='${ids.owner}' and account_id='${ids.a}'`).out;
  assert.notEqual(sql(as(ids.admin,ids.a,`select public.cv_manage_member('${memberId}','admin',false)`),false).status,0);
  assert.notEqual(sql(as(ids.admin,ids.a,`select public.cv_manage_member('${ownerId}',null,true)`),false).status,0);
});

test("cross-account template references cannot create certificates", () => {
  assert.notEqual(sql(as(ids.member,ids.a,`insert into public.certificates(user_id,account_id,certificate_id,template_id,status) values('${ids.member}','${ids.a}','forged','${ids.templateB}','Active')`),false).status,0);
});
test("an invitation is recipient-bound and can be accepted once", () => {
  reserve("recipient@example.test", 1);
  assert.notEqual(sql(accept(ids.other, 1), false).status, 0);
  assert.equal(sql(accept(ids.recipient, 1, "Invited Professional")).out, ids.a);
  assert.notEqual(sql(accept(ids.recipient, 1), false).status, 0);
  assert.equal(sql(`select count(*) from public.account_members where account_id='${ids.a}' and user_id='${ids.recipient}'`).out, "1");
});
test("an existing user can join another organization without losing prior membership", () => {
  reserve("recipient@example.test", 2, undefined, ids.b);
  sql(accept(ids.recipient, 2));
  assert.equal(sql(as(ids.recipient, null, "select count(*) from public.cv_list_accounts()")).out, "2");
});
test("unconfirmed email cannot accept even when authenticated", () => {
  reserve("unconfirmed@example.test", 3);
  assert.notEqual(sql(accept(ids.unconfirmed, 3), false).status, 0);
});
test("expiry and cancellation prevent acceptance", () => {
  const id = reserve("other@example.test", 4);
  sql(`update public.account_invitations set expires_at=now()-interval '1 second' where id='${id}'`);
  assert.notEqual(sql(accept(ids.other, 4), false).status, 0);
  const fresh = reserve("other@example.test", 5);
  sql(as(ids.owner, ids.a, `select public.cv_revoke_invitation('${fresh}')`));
  assert.notEqual(sql(accept(ids.other, 5), false).status, 0);
});
test("resend replaces tokens and cannot target another organization", () => {
  const previous = reserve("other@example.test", 6);
  assert.notEqual(sql(as(ids.owner, ids.b, `select public.cv_prepare_invitation('other@example.test','${hash(7)}','${previous}')`), false).status, 0);
  reserve("other@example.test", 7, previous);
  assert.notEqual(sql(accept(ids.other, 6), false).status, 0);
  sql(accept(ids.other, 7));
});
test("simultaneous duplicate reservations create exactly one pending invitation", async () => {
  const statements = [8,9].map((n) => as(ids.owner, ids.a, `select public.cv_prepare_invitation('race@example.test','${hash(n)}')`));
  const results = await Promise.all(statements.map(concurrentSql));
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(sql("select count(*) from public.account_invitations where invited_email='race@example.test' and status='pending'").out, "1");
});
test("simultaneous acceptance creates one membership and one acceptance audit event", async () => {
  sql(`insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-0000-0000-000000000007','race@example.test',now())`);
  const n = Number.parseInt(sql("select token_hash from public.account_invitations where invited_email='race@example.test'").out,16);
  const results = await Promise.all([concurrentSql(accept("00000000-0000-0000-0000-000000000007", n, "Concurrent User")),concurrentSql(accept("00000000-0000-0000-0000-000000000007", n, "Concurrent User"))]);
  assert.equal(results.filter((result) => result.status === 0).length, 1);
  assert.equal(sql("select count(*) from public.cv_audit_events where action='invitation.accepted' and actor_id='00000000-0000-0000-0000-000000000007'").out,"1");
});
test("removal immediately denies access to the member's own historical records", () => {
  const memberId = sql(`select id from public.account_members where account_id='${ids.a}' and user_id='${ids.member}'`).out;
  sql(as(ids.owner, ids.a, `select public.cv_manage_member('${memberId}',null,true)`));
  assert.equal(sql(as(ids.member, ids.a, "select count(*) from public.certificates")).out, "0");
  assert.equal(sql(as(ids.member, ids.b, "select count(*) from public.certificates")).out, "1");
  assert.equal(sql("select count(*) from public.certificates where certificate_id='A-1'").out, "1");
});
test("removed administrators return as members when reinvited", () => {
  const adminId = sql(`select id from public.account_members where account_id='${ids.a}' and user_id='${ids.admin}'`).out;
  sql(as(ids.owner, ids.a, `select public.cv_manage_member('${adminId}',null,true)`));
  reserve("admin@example.test",10);
  sql(accept(ids.admin,10));
  assert.equal(sql(`select role from public.account_members where id='${adminId}'`).out,"member");
});
test("owners cannot be removed through member controls and audit rows cannot be edited", () => {
  const ownerId = sql(`select id from public.account_members where account_id='${ids.a}' and user_id='${ids.owner}'`).out;
  assert.notEqual(sql(as(ids.owner, ids.a, `select public.cv_manage_member('${ownerId}',null,true)`),false).status,0);
  assert.notEqual(sql(as(ids.owner, ids.a,"delete from public.cv_audit_events"),false).status,0);
});
test("legacy certificate ID RPC is not callable directly", () => {
  assert.notEqual(sql(as(ids.owner, ids.a, `select public.generate_certificate_id('${ids.b}')`),false).status,0);
  assert.equal(sql(as(ids.owner, ids.a,"select public.cv_generate_certificate_id()")).out,ids.a);
});

test("new-user invitations require completed name and Auth password setup", () => {
  reserve("new@example.test", 11);
  const user = "00000000-0000-0000-0000-000000000008";
  sql(`insert into auth.users(id,email,email_confirmed_at,encrypted_password) values('${user}','new@example.test',now(),'')`);
  assert.notEqual(sql(accept(user,11,"New Professional"),false).status,0);
  sql(`update auth.users set encrypted_password='synthetic-test-password' where id='${user}'`);
  assert.notEqual(sql(accept(user,11),false).status,0);
  assert.equal(sql(accept(user,11,"New Professional")).out,ids.a);
});

test("acceptance racing resend cannot accept both the old and new tokens", async () => {
  const user = "00000000-0000-0000-0000-000000000009";
  sql(`insert into auth.users(id,email,email_confirmed_at) values('${user}','accept-race@example.test',now())`);
  const previous = reserve("accept-race@example.test",12);
  const results = await Promise.all([
    concurrentSql(accept(user,12)),
    concurrentSql(as(ids.owner,ids.a,`select public.cv_prepare_invitation('accept-race@example.test','${hash(13)}','${previous}')`)),
  ]);
  assert.equal(results.filter((result) => result.status === 0).length,1);
  const acceptedOld = sql(`select status from public.account_invitations where id='${previous}'`).out === "accepted";
  if (acceptedOld) assert.notEqual(sql(accept(user,13),false).status,0);
  else { assert.notEqual(sql(accept(user,12),false).status,0); sql(accept(user,13)); }
  assert.equal(sql(`select count(*) from public.account_members where account_id='${ids.a}' and user_id='${user}'`).out,"1");
});

test("existing-user invitations bind to the original Auth identity as well as email", () => {
  reserve("other@example.test",14,undefined,ids.b);
  const duplicate = "00000000-0000-0000-0000-000000000010";
  sql(`insert into auth.users(id,email,email_confirmed_at) values('${duplicate}','other@example.test',now())`);
  assert.notEqual(sql(accept(duplicate,14),false).status,0);
  assert.equal(sql(accept(ids.other,14)).out,ids.b);
});
