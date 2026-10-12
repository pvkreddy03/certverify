# Stage 6 — Secure payment gateway foundation

Base: Stage 5 PR #8 at `ceacb1362a5e12421c93cc08c435fa036aa6cf4a`.
Stage 6 SQL is an unapplied proposal; earlier draft PRs are unchanged.

## Implemented

The provider interface isolates order creation, authoritative payment/order fetching,
callback and webhook verification, refunds and explicit capabilities. Razorpay is the
first adapter. PhonePe remains an adapter extension, not a second implementation.
Razorpay supports partial refunds but this implementation enables neither automatic
recurring mandates nor order cancellation. Live keys are rejected. Collection defaults
to disabled and can only be configured as `razorpay_test`.

Owner checkout uses the immutable Stage 5 intent/quote and rechecks confirmed email,
account status, seats, period identity, expiry and catalog eligibility. The database
reserves coupon capacity before any external order call. Receipt, amount, currency,
account, actor and expiry are immutable. One attempt per intent prevents duplicate
order creation. An uncertain external outcome stays `preparing`; it is not retried.
MFA administrators may recover the exact existing order after receipt/amount checks.

Callback HMAC uses server-stored order ID plus payment ID, never a client amount.
Webhooks validate HMAC-SHA256 against bounded exact raw bytes before JSON processing.
Both paths fetch authoritative payment and order data, verify relationships and exact
money, and call narrowly granted settlement RPCs. Only captured payments grant access.
Persistent event identity/fingerprints, per-account locks, immutable observations and
one settlement per attempt prevent duplicate processing. Failed/authorized or stale
out-of-order events cannot overwrite verified capture. Client success is not authority.

Initial payments start a period; early renewals and plan changes schedule at the next
boundary and preserve current quota. Positive-price changes do not silently reprice
old contracts. Late, cancelled, seat-incompatible, removed-owner or suspended captures
are recorded for review without access. No grace period is invented: entitlement ends
at its existing period boundary. Renewal preference does not schedule a gateway charge.

Partial refunds preserve access/consumption; full refunds block the linked paid period.
Disputes conservatively block that period and remain distinctly `disputed`, not proof
that funds have been reversed. No stale capture can restore blocked access. Periods,
prices, audits, consumed quota and public certificates remain historical evidence.
MFA administrators can record and submit a reasoned test refund; external POST is
single-shot. One refund command per payment is a conservative beta limitation; further
refunds/uncertain outcomes require reconciliation and reviewed support handling.
There is no automated dispute restoration or compensation for review captures.

Customer payment screens show disabled/test-only checkout, server verification and
status. Super Admin monitoring includes attempt state, settlement, refunds and recovery.
The server uses service credentials only for narrowly granted order-binding,
reconciliation/settlement and refund-reference functions. New tables deny direct
service-role reads/writes, and unchecked billing helpers stay inaccessible.

## Configuration and sandbox checks

Default: `CERTVERIFY_PAYMENT_MODE=disabled` (or unset). To use a disposable sandbox:

- `CERTVERIFY_PAYMENT_MODE=razorpay_test`
- `RAZORPAY_TEST_KEY_ID` (`rzp_test_…`; public checkout identifier, supplied by server)
- `RAZORPAY_TEST_KEY_SECRET` (server only)
- `RAZORPAY_TEST_WEBHOOK_SECRET` (server only; configure the gateway webhook)
- Existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
  server-only `SUPABASE_SECRET_KEY`, all belonging to the isolated project.

Configure HTTPS `/api/payments/webhook` for payment authorized/captured/failed,
order paid, refund processed/failed and dispute created events. Keep test and live
credentials separate. Do not configure real production keys or enable real collection.
Browser fixtures explicitly disable collection and empty gateway settings, overriding
inherited environment variables. Tests never contact a real payment gateway.

Razorpay documentation pages returned HTTP 403 during development. Signing conventions
were verified against official `razorpay/razorpay-node` source. Actual sandbox order,
checkout, capture, refund, webhook delivery/retry and dispute payload compatibility
still require verification. No sandbox credentials or real Supabase connection were
used. Supported currencies/minimum amounts and gateway capture configuration must be
validated in the actual test merchant account; automatic capture is not assumed.

## Validation and limitations

Automated coverage includes raw/canonical signatures, invalid bodies, live-key denial,
authoritative amount/currency/receipt checks, disabled checkout, authorization,
concurrent capture, reserved coupons, quote expiry, failures, refunds/disputes,
immutable history, scheduled renewal and SQL privileges. Database tests execute all
six staged proposals against disposable synthetic legacy schema. Browser tests use
mocked Supabase; genuine Auth/MFA/Storage/email are not certified.

Passed locally: 33 unit, 119 PostgreSQL and 36 browser tests (188 total; no failures
or skips), TypeScript, lint (seven existing warnings, zero errors) and production build.
GitHub CI outcomes are recorded in the draft PR.
Stage 7 will add cross-stage local integration, adversarial review and release runbook.
Remaining Stage 1–5 Supabase integration and historical reconciliation gates still apply.

No invoices/taxes, automatic paid renewal, provider mandates, automatic refunds,
proration or grace-period automation are claimed. A captured review payment needs
support reconciliation/refund; it never grants accidental access. No production merge,
deployment, migration or charge occurred. Stage 8 remains postponed.
