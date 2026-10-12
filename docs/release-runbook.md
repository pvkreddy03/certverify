# CertVerify beta release runbook — approval required for production

## Readiness classification

Code is prepared for a test-mode beta, with local SQL/HTTP integration and browser
contracts tested. Genuine hosted integrations are incomplete. **Staging ready and
production ready are not achieved.** No external independent penetration test occurred.
Real payment collection is deliberately disabled even if live keys are supplied.

## Configuration (use secure environment settings)

| Variable | Purpose / exposure |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public URL of the selected isolated Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public/publishable key; RLS still enforces access |
| `SUPABASE_SECRET_KEY` | Server-only credential, never `NEXT_PUBLIC_`; payment RPCs are narrow |
| `NEXT_PUBLIC_APP_URL` | Approved canonical HTTPS application origin for email and QR links |
| `VERCEL_ENV`, `VERCEL_URL` | Vercel-provided preview/production context; preview emails use preview origin |
| `CERTVERIFY_READONLY_DATABASE_URL` | Verified-TLS read-only schema inspection, private reports only |
| `CERTVERIFY_PAYMENT_MODE` | Unset/`disabled` normally; only `razorpay_test` supported |
| `CERTVERIFY_DEPLOYMENT_TARGET` | Must be `isolated_sandbox` for test payment processing |
| `CERTVERIFY_SANDBOX_PROJECT_REF` | Must match `https://<ref>.supabase.co`; protects payment database binding |
| `RAZORPAY_TEST_KEY_ID` | `rzp_test_` public checkout identifier |
| `RAZORPAY_TEST_KEY_SECRET` | Server-only test API secret |
| `RAZORPAY_TEST_WEBHOOK_SECRET` | Server-only raw-body HMAC secret; separate from API secret |
| `CERTVERIFY_RATE_LIMIT_SECRET` | Server-only random secret, at least 32 characters; keyed request identities |

No secret values belong in chat, repository files, public build variables, screenshots,
client logs or issue comments. Use existing injected GitHub authentication. Configure
Vercel preview and production scopes independently; previews must never bind production
Supabase, email audiences or gateway credentials. Default all payment modes to disabled.
A `VERCEL_ENV=production` deployment cannot enable this test payment adapter.

Actual SMTP delivery, sender/domain identity, Supabase Auth site/redirect allowlists,
TOTP enrollment and private Storage bucket policies require isolated project setup.
Do not relax redirect allowlists, confirmation, MFA, TLS or RLS to get a test passing.

## Exact ordered procedure

1. **Review stacked PRs and release scope.** Record exact heads, inspect CI and run
   `npm run migration:manifest`. Review Stages 1–7 together; no default-branch merge is
   implied. Keep payment processing disabled and Stage 8 postponed.
2. **Inspect read-only live schema.** Supply secure read-only binding and run inspections
   `--stage=1`, `--stage=3`, `--stage=4`, `--stage=5`, `--stage=7`. Privately reconcile
   actual SQL functions, grants/default privileges, triggers, constraints, RLS, table
   ownership, auth signup/account creation and certificate numbering. No function body
   from a synthetic fixture is evidence of live safety. Resolve every mismatch first.
3. **Prepare isolated Supabase project and restorable backup.** Use anonymized fixture
   data; keep production credentials absent. Review historic template ownership,
   account/membership preservation, issuer branding snapshots, existing suspensions,
   certificate numbers and actual subscription/payment/usage evidence. Never seed all
   legacy accounts with free unlimited access or relabel historical payments waived.
4. **Apply approved proposals to the isolated project only, in this order:**

   1. `supabase/proposals/20261012_stage1_account_security.sql`
   2. `supabase/proposals/20261012_stage2_certificate_revocation.sql`
   3. `supabase/proposals/20261012_stage3_branding.sql`
   4. `supabase/proposals/20261012_stage4_platform_admin.sql`
   5. `supabase/proposals/20261012_stage5_billing.sql`
   6. `supabase/proposals/20261012_stage6_payments.sql`
   7. `supabase/proposals/20261012_stage7_readiness.sql`

   Each proposal has its own transaction and dependencies. Stop at the first failure;
   do not skip errors, strip constraints or assume a partial sequence is usable. Verify
   row counts/IDs and grants after every stage. Run reviewed historical backfills/imports
   with explicit provenance and separate approval; they are not automatically generated
   from unverified legacy assumptions. Do not apply these files blindly to production.
5. **Bootstrap an isolated platform administrator.** Use a reviewed privileged operation,
   confirmed email and actual TOTP. Verify ordinary owner/admin metadata cannot grant
   platform access. Test `aal1` denial, `aal2` success, revoked admins, account access
   suspension/restoration and private-data projections.
6. **Run genuine authentication/organization journeys.** Test signup/confirmation creates
   one correct individual account; owner upgrades to organization; new-user invitation
   presents name/password/confirmation before dashboard; existing user retains credentials
   and accepts second membership; wrong recipient/expiry/resend/cancellation/replay/race
   deny correctly. Verify actual emails and callbacks, recovery token handling, logout,
   removed access and account switching. These are currently incomplete externally.
7. **Run Storage/branding/certificate integration.** Upload genuine and malicious images,
   test private cross-tenant object access and expired editing permissions, approval and
   immutable history. Reconcile old issuer identity before public verification tests.
   Verify genuine numbering function uniqueness under concurrency, template ownership,
   required/dynamic/public/private fields, issuance quotas, QR PNG/JPEG, revocation reasons,
   replacement linkage and mandatory CertVerify attribution on the approved official domain.
8. **Configure test-only merchant integration.** Set the sandbox variables above and
   HTTPS `/api/payments/webhook`; configure supported payment authorized/captured/failed,
   order paid, refund processed/failed and dispute-created events. Verify actual payloads,
   signature algorithm, capture settings, supported currency precision/minimums and
   retries. Callback authorization alone cannot activate access. Test tampering,
   concurrent capture, coupon reservations, failures, late payments, removed/suspended
   owners, refunds and disputes. Verify cancellation preserves already-paid future periods and their non-renewing
   preference; direct paid-request cancellation must require reviewed refund handling.
   Never use real cards/charges or live keys in this work.
9. **Validate partial-failure recovery and operations.** Lose an order/refund response;
   recover the exact receipt-matched existing order in MFA monitoring and reconcile its
   payment. Do not recreate uncertain POSTs. Run the sandbox reconciliation job via
   existing approved scheduling infrastructure (no scheduler installed here). Pending
   attempts need five-minute checks; captures six-hour checks; each batch caps at 20.
   Increase scheduled batch frequency based on measured backlog. Budget cleanup caps at
   50,000 old rows per run; monitor lag. Webhooks/manual reconciliation cover older captures.
10. **Complete staging validation and observability.** Run all suites, types/lint/build,
    production/full dependency audits and genuine scenarios A–E. Verify hosted endpoint
    rate controls for public verification and Supabase Auth (application payment budgets
    do not protect direct anonymous public RPCs or hosted Auth endpoints). Configure
    alerts for webhook failures/review captures, unbound attempts, coupon reservations,
    reconciliation backlog, failed/uncertain refunds, budget denials, audit growth and
    storage failures. Logs must use safe correlation IDs, not keys/raw bodies/private
    certificate values. Verify backup restoration in a disposable project; confirm
    actual plan-specific backup/PITR availability rather than assuming it exists.
11. **Resolve commercial and launch blockers.** Approve actual editable prices/terms,
    cancellation/refund/retention policies, renewal consent, grace rules, taxes/invoices,
    paid historical imports and official domain. Additional refund commands, dispute
    restoration and immediate proration remain reviewed support/implementation work.
    Resolve five residual development dependency advisories or obtain a documented
    risk acceptance; do not describe the full dependency audit as clean. Perform an
    independent security review and validate load/query plans for expected tenants.
12. **Request production approval only after a concrete staging result is reviewable.**
    The current code cannot process live payments. Any live adapter enablement,
    production credentials/real charges, production backfills/migrations, merges and
    deployment need explicit approval and another verified release. After approval,
    take and verify backup, define maintenance/write freeze and restoration checkpoint,
    apply reviewed database sequence/backfills before the compatible application,
    verify grants/row counts and private smoke tests, then perform controlled rollout.
    Keep live collection disabled until that separately approved financial test passes.

## Failure and rollback procedure

Disable collection and pause webhook/job intake before application rollback. Persist
received financial evidence and outstanding gateway references; provider capture may
continue even when application intake is paused, so reconcile afterwards. A prior app
must be tested against the new schema before rollback. Do not drop financial/audit tables,
restore consumed quota, overwrite issuer history or delete revoked certificates.

Prefer reviewed forward repair. Database rollback/restore requires a tested backup,
approved reconciliation of external captures/refunds and maintenance coordination.
A database restore cannot reverse a gateway payment. Do not automatically replay order
or refund POSTs after restore; match immutable receipts and provider references first.
No production backup, restore, migration or deployment was executed during development.

## Current critical launch blockers

- Secure read-only actual schema access and historical ownership/branding/entitlement
  reconciliation; actual signup/account triggers and certificate numbering remain unknown.
- Genuine Supabase Auth/MFA/email/Storage and actual Razorpay test merchant journeys.
- Approved scheduling/monitoring/backup-restore and public/Auth abuse controls.
- Actual payment, refund, tax/invoice, renewal/grace and retention terms; live collection
  implementation/approval. Review captures/disputes and additional refunds need support.
- Residual development dependency advisories and independent release/security review.

Code/tests/draft PRs alone do not clear these gates. Stage 8 PDF/OCR/AI stays postponed.
