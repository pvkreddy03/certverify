# Stage 5 — Plans, pricing, quotas and offers

This branch builds on Stage 4 without changing or merging earlier pull requests.
The SQL in `supabase/proposals/20261012_stage5_billing.sql` is an **unapplied proposal**.
No production data, configuration, deployment or payment collection is changed.

## Implemented behavior

- MFA-protected Platform Super Admin pricing screens manage versioned plans and
  campaigns: draft, active, inactive and archived states; individual/organization
  eligibility; enterprise sales-assisted plans; monthly, annual and custom periods;
  currency precision; initial/renewal prices; included and additional seats; bounded
  or unlimited certificates; trial duration; visibility, dates and feature metadata.
  Example INR prices populate editable forms only. No catalog or price is seeded.
- Coupons support percentage, fixed and introductory prices, free trials, introductory
  cycles, plan restrictions, new/existing/selected-account targeting, start/end dates,
  global redemption limits and one redemption per account. Protected targeting details
  are omitted from customer quote and financial-history responses.
- Customer subscription pages display quota, seats, period end, catalog, server quotes,
  renewal terms, requests and financial history. Owners can accept eligible free/trial
  quotes and cancel or resume renewal preferences. Members see entitlements without
  owner financial controls. Billing remains accessible after entitlement expiry;
  suspended owners may still cancel renewal. Activation requires confirmed email.
- Positive-price acceptance creates an immutable pending payment intent, **not paid
  access**. MFA administrators may explicitly grant a reasoned complimentary period,
  recorded as waived rather than a successful payment. No provider checkout,
  webhook ingestion or payment settlement is active.
- Account-level database locks serialize certificate issuance, seat reservations and
  subscription transitions. Pending invitations reserve seats. Acceptance replaces
  the recipient's reservation. Concurrent issuance cannot exceed the period quota.
  Failed issuance rolls back usage; scans, revocation and deletion never restore quota.
- Expired accounts retain sign-in, billing, history and public certificate verification.
  Issuance, template administration, new invitations and paid branding operations
  require current entitlement. Certificate revocation remains available for security.
  Administrative suspension continues to enforce Stage 4 restrictions separately.
- Plan/seat changes schedule at the next boundary rather than resetting current usage.
  Scheduled seat reductions cap further reservations. Free scheduled changes materialize
  through trusted billing checks; incompatible changes require review. Renewal preference
  does not create a recurring charge or automatically activate positive-price periods.
- Immutable price versions, quote payloads, period snapshots, consumption evidence,
  payment events and financial audit records preserve historical terms and responsible
  actors. Clients cannot override prices or manufacture payment status. Database guards
  reject overlapping periods, trial resets, usage reductions and inconsistent payment
  ledger events. Private financial functions/tables revoke inherited service-role grants.
- Existing subscribers renew against agreed versioned terms. Client-supplied intent
  cannot select renewal prices before enrollment or repeatedly select first-period
  prices. A newly deactivated plan cannot enroll a previously quoted new customer.

## Validation

The final local run uses Node 22, disposable PostgreSQL and loopback browser fixtures.
Passed: 27 unit tests, 102 PostgreSQL tests and 32 browser tests (161 total),
including 4 unit, 31 database and 8 browser Stage 5 cases. No tests failed or were
skipped. TypeScript, ESLint and the production build passed; ESLint retains seven existing
warnings and zero errors.

PostgreSQL tests execute all staged proposals against a synthetic legacy schema and
exercise real RLS, triggers, grants, financial guards, cross-tenant access and races.
Browser tests validate application journeys against a mocked Supabase service, not
real Auth, MFA, Storage, email delivery or payment gateways. Read-only preflight SQL
is tested locally. See `stage-5-supabase-integration.md` for live release gates.

Commands: `npm test`, `npm run test:db`, `npm run test:browser`,
`npx next typegen && npm run typecheck`, `npm run lint`, `npm run build`.
Cloud browser checks may use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`;
CI installs Playwright's Chromium. Builds use placeholder Supabase settings.

## Stage 6/7 boundaries

No real payments, invoices, tax handling, refunds, proration, automatic paid renewal,
provider cancellation, reminders, grace-period automation or background billing worker
are implemented. Stage 6 must add verified provider settlement and separately approved
commercial policy. Positive-price pending requests are not active subscriptions.
Enterprise contracts use reviewed administrative grants until verified payment flows
exist. Reporting includes operational subscription/payment state and history, not a
complete accounting, MRR/ARR or promotional conversion analytics system.

Historical paid subscriptions need an approved import and verified provenance before
rollout; do not label them waived or silently change agreed prices. Current missing
entitlement intentionally fails closed. Large-catalog/report pagination, performance,
operational monitoring and independent release review remain Stage 7 work.
Stage 8 PDF/OCR/AI remains postponed.
