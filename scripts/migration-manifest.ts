// PRINT ONLY: no database connection, SQL execution or credentials are accepted.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { migrationPlan } from "../lib/security/migration-plan";
if (process.argv.length > 2)
  throw new Error("This command accepts no arguments and never applies SQL.");
const proposals = migrationPlan.map((name, index) => {
  const path = `supabase/proposals/${name}`,
    body = readFileSync(path, "utf8");
  return {
    order: index + 1,
    path,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
});
process.stdout.write(
  JSON.stringify(
    { mode: "print-only", productionApprovalRequired: true, proposals },
    null,
    2,
  ) + "\n",
);
