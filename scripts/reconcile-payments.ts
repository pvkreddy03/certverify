// Sandbox-only, GETs gateway state and settles verified evidence; never creates orders/refunds.
import { configuredGateway } from "../lib/payments/config";
import {
  paymentService,
  checkedRpc,
  paymentBudget,
} from "../lib/payments/server";
import { reconcileBatch } from "../lib/payments/reconciliation";
async function main() {
  if (process.argv.slice(2).join(" ") !== "--sandbox")
    throw new Error(
      "Use --sandbox with isolated test configuration; production execution is not enabled.",
    );
  const gateway = configuredGateway(),
    service = paymentService();
  await paymentBudget(service, "maintenance", "reconciliation_job", 10);
  const result = await reconcileBatch(gateway, service);
  let pruned = 0;
  for (let n = 0; n < 10; n++) {
    const count = (await checkedRpc(
      service,
      "cv_prune_request_budgets",
      {},
    )) as number;
    pruned += count;
    if (count < 5000) break;
  }
  process.stdout.write(
    JSON.stringify({ ...result, prunedBudgetRows: pruned }) + "\n",
  );
  if (result.failed) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Reconciliation did not complete. Check isolated configuration and protected diagnostics; no success is assumed.",
  );
  process.exitCode = 2;
});
