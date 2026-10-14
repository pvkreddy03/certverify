import { Client, type QueryResult } from "pg";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

async function inspect() {
  const stageArgument=process.argv.slice(2);
  if (stageArgument.length>1 || (stageArgument[0] && !["--stage=1","--stage=3","--stage=4","--stage=5","--stage=7","--stage=hosted"].includes(stageArgument[0]))) {
    console.error("Use --stage=1, --stage=3, --stage=4, --stage=5, --stage=7 or --stage=hosted for the prepared read-only inspections.");process.exitCode=2;return;
  }
  const stage=stageArgument[0]?.split("=")[1] ?? "1";
  const connection = process.env.CERTVERIFY_READONLY_DATABASE_URL;
  if (!connection) {
    console.error("Read-only inspection is pending: set CERTVERIFY_READONLY_DATABASE_URL securely in environment settings. Do not send it in chat.");
    process.exitCode = 2;
    return;
  }
  const url = new URL(connection);
  if (!["postgres:","postgresql:"].includes(url.protocol)) throw new Error("Invalid database protocol");
  // Force certificate/hostname verification, regardless of URL sslmode shortcuts.
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith("ssl")) url.searchParams.delete(key);
  const caFile = process.env.CERTVERIFY_DB_CA_FILE;
  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ...(caFile ? { ca: await readFile(caFile,"utf8") } : {}) },
    application_name: "certverify-readonly-inspection", connectionTimeoutMillis: 10_000,
  });
  try {
    await client.connect();
    const source = await readFile(stage==="hosted" ? "supabase/inspection/hosted-security-readonly.sql" : `supabase/inspection/stage${stage}-readonly.sql`,"utf8");
    const results = await client.query(source) as unknown as QueryResult[];
    if (!results.some((result) => result.rows.some((row) => row.readonly_transaction === "on"))) throw new Error("Read-only transaction not established");
    const directory = resolve(".certverify-private");
    await mkdir(directory,{ recursive:true, mode:0o700 });
    const file = resolve(directory,`stage${stage}-inspection-${randomUUID()}.json`);
    await writeFile(file,JSON.stringify({ captured_at:new Date().toISOString(), groups:results.filter((result) => result.command === "SELECT").map((result) => result.rows) },null,2),{ mode:0o600, flag:"wx" });
    console.log(`Read-only inspection saved privately: ${file}`);
    console.log("Do not commit or share this raw report: SQL function bodies may contain sensitive literals. Review and sanitize before producing a schema baseline.");
  } finally { await client.end(); }
}
void inspect().catch(() => {
  // Driver messages can include connection details. Never print their raw text.
  console.error("Read-only inspection failed. Check secure connection access, permissions and the trusted TLS CA. No migration or email operation was attempted.");
  process.exitCode = 1;
});
