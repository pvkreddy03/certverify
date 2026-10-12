# Phase 8 hosted preparation checkpoint

Base is exact validated Stage 7 head `573d511d23949c3a112c9e75f789c081bacee1cf`;
all PR #4–#10 heads are ancestors and PR #10 CI is confirmed successful.
Branch: `feat/phase-8-hosted-testing-preparation`. Do not modify previous PRs.

Prepared:
- Authenticated `/account/security` for MFA enrollment before any admin grant, outside
  organization/subscription gates; reuses platform MFA without granting platform access.
- Offline `npm run hosting:preflight`: rejects mismatched sandbox binding, production
  context, public secret names, missing settings and live gateway mode/keys. Never
  prints values, contacts providers or claims hosted verification.
- Explicit-approval-only `supabase/operations/sandbox-owner-bootstrap.sql`; separate
  from migrations, requires active confirmed non-anonymous owner and verified TOTP,
  serializes first grants and preserves transactional audit with operator attribution.
- `docs/hosted-testing-preparation.md`: dependency heads, actual missing baseline,
  ordered approvals, preview configuration, secure setup and 25-step phone/PC checklist.
- Saved environment start instructions corrected through cloud onboarding configuration;
  this does not apply secrets, run commands or publish/deploy an environment.

Final complete local validation passed: **220 unique tests — 42 unit, 138 PostgreSQL,
40 browser**, no failures/skips. Type generation, TypeScript and production build passed;
lint passed with zero errors and seven existing warnings. Affected bootstrap/MFA checks
were also run during debugging before the final complete suites.
No new draft PR/CI is published: existing Vercel Git integration auto-deploys feature
branches, sandbox-only binding is unconfirmed, and the latest instruction requires
explicit deployment approval. Preserve this work as a local commit/recovery bundle.
Production dependency audit: zero findings; full dependency audit: five high development
findings remain. Do not force incompatible updates or claim the full audit is clean.

External gates:
- Current injected Supabase keys belong to the protected source environment. No management
  token, read-only connection or approved sandbox project reference is available.
- Existing Vercel Git integration publishes Preview deployments, but no management
  connection/token or confirmed sandbox-only preview variables are available. Previous
  head preview cannot be inspected from this machine (proxy tunnel HTTP 403). No Razorpay test
  keys/webhook secret. Owner said they will reconnect; recheck actual bindings/tools
  after a meaningful connection change instead of repeating failed operations.
- Actual legacy function bodies/signup triggers/numbering are absent from the source snapshot.
  Fresh staging now has an independent reviewed baseline; do not use it to reconcile
  source or copy fabricated Auth/Storage/test helpers into hosted Supabase.
- Separate explicit approvals required for hosted migrations and first privileged grant.
  Approval requests must name verified sandbox, reviewed SQL/hashes and owner Auth UUID;
  credentials or an intention to reconnect are not those approvals.

Owner reconnected ChatGPT plugins, but this Cloud task still has no callable provider
management tools or injected management bindings. Existing app Supabase project ref:
`jhnxztaqfikgvkshifel`, now verified by owner as protected source with application data. See exact connection steps in the hosted guide.
Credential-free Supabase health and old-preview HTTPS both fail at the egress proxy
with HTTP 403. Additive Cloud network requirements were saved for environment review;
no runtime propagation or provider connection has been verified.
Latest instruction requires approval before ANY deployment; do not push this branch
while Vercel auto-deployment could run. Preserve a local commit and recovery bundle.

Next: inspect connections read-only, identify free sandbox resources without incurring
costs, inspect actual schema, complete baseline/diff, request concrete migration approval,
configure Preview-only secrets/redirects, test genuine Auth/Storage/email, enroll owner
MFA, request admin-grant approval, test merchant sandbox and checklist, then report real
preview URL and hosted evidence. Never merge/deploy production/charge real customers.
Stage 8 PDF/OCR/AI remains postponed; this Phase 8 is hosted QR testing preparation.


Continuation implements a fresh staging baseline (one file + seven proposals), actual
application signup/numbering/policies tested in PostgreSQL with managed-service fixtures,
source-rejecting Next Preview/payment/preflight guards and source-ref bootstrap rejection.
Public anonymous definers are deliberately limited to reviewed catalog/certificate/logo
projections. The read-only hosted inspection and curated legacy ACL candidate generator
prepare actual advisor/body review without changing source. See
`docs/hosted-infrastructure-handoff.md` for exact owner-verified IDs, shared Vercel scope
separation, costs/approvals, eight-file ordering, variables and rollback.
Final continuation validation passed: **235 tests — 46 unit, 149 isolated PostgreSQL,
40 mocked browser**, no failures/skips. Type generation, TypeScript, lint and production
build passed; seven existing lint warnings remain. The final bootstrap source-rejection
change was additionally rerun through all four bootstrap PostgreSQL checks. Production
audit is clean; full audit retains five high development findings.
Preserve the continuation local commit plus refreshed portable bundle/patch. No Phase 8 push/PR/deployment is authorized
while shared Preview bindings could reach source. Stage 7 CI remains the confirmed remote
baseline; do not claim new Phase 8 CI or hosted results. Connected tools can execute the
handoff separately after approvals; Cloud tokens are optional, not a demand on the owner.
