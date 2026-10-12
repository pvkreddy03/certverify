# Stage 6 integration and rollback gates

1. Obtain secure read-only schema access and complete Stage 1/3/4/5 inspections.
   Confirm actual function bodies, legacy triggers, table ownership, default privileges,
   RLS, historical template/branding/entitlement mappings. Do not use chat for secrets.
2. In a disposable Supabase project, apply reviewed proposals in order 1 → 2 → 3 → 4 →
   5 → 6. Stage 6 extends named Stage 5 constraints and replaces billing materialization,
   active-period selection, offer-capacity checks, customer financial history and reports.
   Review existing constraints/functions before applying; this is not production-safe
   solely because the synthetic PostgreSQL tests passed.
3. Test real JWT/MFA/confirmed email, owner removal, cross-organization headers and
   service-role behavior. Service-role must have no direct access to financial tables
   or unchecked activation helpers. Only the explicit checked payment RPCs are granted.
4. Configure Razorpay test merchant keys/webhook secrets through isolated environment
   settings. Verify server-only secrets are absent from browser bundles/logs. Configure
   exact HTTPS webhook endpoint and documented event types; record merchant capture
   settings. Test authorized-but-not-captured payments and actual capture transitions.
5. Exercise trials → pending payment → reserved coupon → order → signed callback →
   authoritative capture → one period; repeat simultaneous callbacks/webhooks and
   changed event headers. Confirm forged signatures, wrong receipts/order/amount/currency,
   expired/cancelled/suspended/removed-owner captures cannot grant access.
6. Simulate gateway success followed by database failure, response loss, and provider
   timeout. Never create another order/refund automatically. In the gateway test
   dashboard find the order with the immutable receipt; MFA admin enters its order ID
   and attempt ID in payment monitoring, which independently fetches and verifies it.
   Then reconcile the provider payment ID. Unknown/unbound orders return non-success
   to the webhook for retry; no payment success is assumed until durable settlement.
7. Verify real partial/full refunds and dispute events. Refresh authoritative payment
   state through monitoring. Full refund/dispute blocks only the linked paid period,
   preserves public certificate verification and all historical evidence. Dispute
   resolution/restoration and additional refund commands require reviewed support
   handling; do not edit financial rows manually to restore access.
8. Reconcile positive-price pending intents imported from Stage 5 before enabling test
   checkout. Expired quotes require cancellation/new quotes; never reuse old price
   snapshots as unlimited validity. Paid historical imports require verified provenance
   and reviewed mapping. No default price or existing-account paid entitlement is seeded.

Rollback: disable payment mode and external webhook delivery before restoring an
application release that lacks these RPCs. Database proposals are additive with replaced
functions/constraints; do not drop financial evidence to roll back. Export protected
financial records into a verified backup and use reviewed forward repairs/restoration.
A previously verified paid period must not be mislabeled complimentary or bypass quotas.
Any production restore, migration, financial correction or deployment requires approval.

No payment sandbox, real Supabase Auth/MFA/Storage/email or actual production schema
compatibility is certified by local fixtures. Stage 7 must record these as release gates.
