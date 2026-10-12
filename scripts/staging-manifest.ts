// PRINT ONLY. Fresh staging sequence; never accepts credentials or executes SQL.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { migrationPlan } from "../lib/security/migration-plan";
if (process.argv.length !== 2) throw new Error("This print-only command accepts no arguments.");
const files = ["supabase/staging/20261012_fresh_baseline.sql",...migrationPlan.map(f=>`supabase/proposals/${f}`)];
console.log(JSON.stringify({mode:"print-only",target:"fresh-approved-staging-only",hostedApprovalRequired:true,sourceProjectForbidden:"jhnxztaqfikgvkshifel",files:files.map((path,index)=>({order:index+1,path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}))},null,2));
