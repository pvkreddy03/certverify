import type { PaymentGateway } from "./types";
import { checkedRpc, reconcilePayment, type PaymentService } from "./server";
export async function reconcileBatch(
  gateway: PaymentGateway,
  service: PaymentService,
) {
  const candidates = (await checkedRpc(
    service,
    "cv_reconciliation_candidates",
    {},
  )) as { id: string; order_id: string }[];
  if (!Array.isArray(candidates) || candidates.length > 20)
    throw new Error("Invalid reconciliation batch.");
  let checked = 0,
    failed = 0;
  for (const candidate of candidates) {
    try {
      const ids = await gateway.fetchOrderPayments(candidate.order_id);
      for (const payment of ids)
        await reconcilePayment(gateway, service, payment);
      await checkedRpc(service, "cv_note_reconciliation", {
        p_attempt: candidate.id,
      });
      checked++;
    } catch {
      failed++;
    }
  }
  return { checked, failed };
}
