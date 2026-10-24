# CertVerify — Razorpay Test Mode setup (staging only)

This guide enables **simulated payments only**. Do not use live credentials, a production domain, or the protected source Supabase database.

## Verified integration boundaries
- Vercel project: `certverify`; staging alias: `https://certverify-staging.vercel.app`.
- Approved isolated database project ref: `nubohxesjeaodqcveiud`.
- Public checkout: `/dashboard/payment?intent=<server-issued-UUID>`.
- Authenticated, read-only setup indicator: `/api/payments/status`.
- Razorpay webhook endpoint: `https://certverify-staging.vercel.app/api/payments/webhook`.
- Recurring mandates are **not** implemented. Existing renewals require fresh, explicit payments.

## Merchant setup
1. In the merchant's Razorpay account, switch to **Test Mode**.
2. Open **Account & Settings → API Keys**, generate **test** credentials.
3. In **Test Mode → Webhooks**, add the staging endpoint shown above. Choose a unique webhook secret and enable the applicable supported events: `payment.authorized`, `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`, and `payment.dispute.created`. Check availability in the account. The integration also recognizes `order.paid`, but verify that Razorpay sends the payment entity before enabling it.
4. Keep credentials private. **Do not paste them into chat, email, GitHub issues, commits, or client-side source.**

## Vercel configuration
Set these *only for the Preview environment* in Vercel project settings (not Production):
- `RAZORPAY_TEST_KEY_ID` — Razorpay test-mode key ID (format `rzp_test_...`).
- `RAZORPAY_TEST_KEY_SECRET` — corresponding test key secret (sensitive/server-side).
- `RAZORPAY_TEST_WEBHOOK_SECRET` — the exact test webhook secret (sensitive/server-side).
- Keep `CERTVERIFY_DEPLOYMENT_TARGET=isolated_sandbox`, `CERTVERIFY_SANDBOX_PROJECT_REF=nubohxesjeaodqcveiud`, and staging Supabase URL/key bindings as they are.
- **Last**, change `CERTVERIFY_PAYMENT_MODE` from `disabled` to `razorpay_test`. Redeploy the reviewed staging branch `fix/phase8-email-feedback-mobile-navigation`. Do not promote it to Production.

The app fails closed on missing, live, or inconsistent credentials. Changing the mode without all required settings can break the staging build. The readiness panel confirms only *configuration*, not successful payment acceptance.

## Test account and plan
1. Use a staging organization owner account, never a production customer.
2. In the **Superadmin → Pricing and offers** page, activate a clearly named **STAGING TEST** paid plan (minimum amount allowed by gateway). Do not publish a test price as the commercial price.
3. As the staging organization owner, open **Subscription and renewal**, select the plan, request a quote, review totals, and confirm. A payment intent should appear.
4. Open its **test checkout** link, complete Razorpay's simulated payment, and verify the payment is `captured` on the Razorpay Test Dashboard.
5. Confirm the CertVerify subscription activates **only** after independent verification of captured payment. Check duplicate callbacks and refresh/retry without duplicate charges.

## Required negative cases
- Failure / cancellation / an authorized-but-uncaptured payment **must not** activate access.
- Missing or invalid callback HMAC, altered amount/currency/receipt, and replayed webhooks **must not** activate a new subscription.
- A payment from another organization must not become visible or payable.
- Refunds / disputes must trigger reviewed reconciliation, not silent paid status.
- Expired subscriptions must block new certificate issuance while preserving existing public QR verification.
- Test UPI, cards, and other methods only if actually enabled for this merchant.

## Commercial activation remains a separate decision
Live payments require successful merchant activation, separate live keys and webhooks, verified payment methods, proper GST/tax invoices as applicable, and an explicit audited production release. No Razorpay Test Mode transactions represent real revenue.
