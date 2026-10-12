import { isAccountId } from "../accounts/context";
export class BillingInputError extends Error {}
function object(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BillingInputError("Invalid billing request.");
  return value as Record<string, unknown>;
}
export function reference(value: unknown) {
  if (!isAccountId(value))
    throw new BillingInputError("Invalid billing reference.");
  return value;
}
export function billingCommand(value: unknown) {
  const v = object(value);
  if (
    ![
      "quote",
      "accept",
      "cancel_request",
      "cancel_renewal",
      "resume_renewal",
    ].includes(String(v.action))
  )
    throw new BillingInputError("Invalid subscription action.");
  if (v.action === "quote") {
    if (
      !Number.isSafeInteger(v.seats) ||
      Number(v.seats) < 1 ||
      Number(v.seats) > 10000 ||
      !["start", "trial", "renewal", "change"].includes(String(v.intent)) ||
      typeof v.coupon !== "string" ||
      v.coupon.length > 40
    )
      throw new BillingInputError(
        "Check seats, offer code and subscription action.",
      );
    return {
      action: v.action,
      params: {
        p_plan: reference(v.planId),
        p_seats: v.seats,
        p_coupon: v.coupon.trim() || null,
        p_intent: v.intent,
      },
    };
  }
  if (v.action === "accept")
    return {
      action: v.action,
      params: { p_quote: reference(v.quoteId), p_nonce: reference(v.nonce) },
    };
  return {
    action: v.action,
    params: {
      p_action: v.action,
      p_request: v.action === "cancel_request" ? reference(v.requestId) : null,
    },
  };
}
export function pricingCommand(value: unknown) {
  const v = object(value);
  if (v.action === "save_plan" || v.action === "save_offer") {
    const terms = object(v.terms);
    if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0)
      throw new BillingInputError("Refresh the catalog revision.");
    if (
      v.action === "save_offer" &&
      (typeof v.code !== "string" || !/^[A-Za-z0-9_-]{3,40}$/.test(v.code))
    )
      throw new BillingInputError(
        "Coupon codes use 3–40 letters, digits, underscores or hyphens.",
      );
    return {
      rpc: v.action === "save_plan" ? "cv_save_plan" : "cv_save_offer",
      params: {
        p_terms: terms,
        p_id: v.id ? reference(v.id) : null,
        p_revision: v.revision,
        ...(v.action === "save_offer" ? { p_code: v.code } : {}),
      },
    };
  }
  if (
    v.action === "status" &&
    ["plan", "offer"].includes(String(v.kind)) &&
    ["draft", "active", "inactive", "archived"].includes(String(v.status)) &&
    Number.isSafeInteger(v.revision) &&
    Number(v.revision) >= 0
  )
    return {
      rpc: "cv_set_catalog_status",
      params: {
        p_kind: v.kind,
        p_id: reference(v.id),
        p_status: v.status,
        p_revision: v.revision,
      },
    };
  throw new BillingInputError("Invalid pricing action.");
}
