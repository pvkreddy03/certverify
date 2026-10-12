# Connected management-tools handoff — Phase 8

This is hosted QR integration, not postponed OCR/AI. Continue the preserved
`feat/phase-8-hosted-testing-preparation` branch, including `16e0e83`, on exact Stage 7
head `573d511`. No production merge or deployment is needed for staging.

## Verified infrastructure supplied by the owner

| Resource | Identity | Treatment |
| --- | --- | --- |
| Supabase source | certverify / `jhnxztaqfikgvkshifel` | Protected, active application data; no writes or staging migrations |
| Supabase organization | `vgaakofkotxijchzpkgo` | Read-only capacity/cost check before creating staging |
| Source region/version | ap-south-1 / PostgreSQL 17 | Staging should match |
| Vercel project | certverify / `prj_yX5ltq28CGjvTo9iM7OtDH1A4z74` | Existing project; Production configuration protected |
| Vercel team | pvkreddy03 / `team_KIMakhoRensbMaOxm8okfCUC` | Verify exact project association before changes |
| Git source | pvkreddy03/certverify, PR #10 | Stage 7 CI successful; stacked draft PRs remain unmerged |

Only one Supabase project was found through the owner's connected account.
No-extra-cost capacity is **not** established by that count. Shared Vercel
Production/Preview Supabase URL, anon and server keys are confirmed. Existing previews
are potentially connected to source data and must not be used for write tests.
Cloud provider tools remain unavailable; previously blocked endpoints are not retried.

## Prompt A — read-only inventory through connected tools

Use the ChatGPT-connected Supabase/Vercel management tools, not assumed Cloud tools.
Perform read-only operations and return a sanitized report:

1. Confirm the exact source/organization/team/project identities above. List project
   capacity, plan limits, free resource availability, region and any creation costs.
   Propose `certverify-staging` in ap-south-1, PostgreSQL 17, with no customer data.
   Do not create, upgrade or purchase until cost and authorization are explicit.
2. Run Supabase security advisor and preserve exact function signatures/findings.
   Privately inspect `supabase/inspection/hosted-security-readonly.sql`, Stage 1/3/4/5/7
   inspections and `legacy-definer-privilege-candidates.sql` against source using a
   read-only transaction. Export schemas, ownership, RLS, effective function/table/
   column grants, default privileges, function bodies, signup triggers, numbering,
   Storage policies and existing subscriptions/status rules. Do not retrieve passwords,
   tokens, Auth secrets or customer certificate values. Function literals can contain
   secrets: raw reports stay private; redact before sharing review artifacts.
3. Inspect Vercel environment **names, scopes, IDs and branch rules only**, not secret
   values. Verify Git repo/production branch, auto-deployment controls, shared three
   Supabase variables, branch-specific overrides, deployment protection and cost of
   any exception. Inspect Production and Preview separately. Record source variable
   IDs for scope changes without logging/copying values to chat or repository.
4. Confirm which existing previews still carry source credentials. They cannot become
   isolated by editing future environment settings alone. Plan to restrict/retire them
   non-destructively with explicit approval; do not rotate production secrets or change
   production access as an unapproved shortcut.
5. Return: capacity/cost, proposed staging identity, safe isolation method, required
   approvals and sanitized compatibility/security findings. No writes yet.

## Prompt B — approved staging execution

Perform only the separately approved actions below, using the verified project IDs.
Every hosted migration and privileged grant needs explicit owner approval. Never
interpret a credential, reconnect, or this document as that approval.

1. If authorized and confirmed no-extra-cost, create `certverify-staging` in the verified
   organization/region with PostgreSQL 17. Keep its generated keys in provider/secure
   environment settings. Record the **new** reference; it must differ from source.
   If free capacity is unavailable, return the actual price for approval and stop creation.
2. Review the eight-file fresh sequence below and request approval identifying this
   new project plus file hashes. Take a sandbox restore checkpoint, then apply each
   transaction in order. Never create fixture Auth/Storage schemas or replay source
   Auth users. Validate triggers/RLS/grants/functions after each step; stop on errors.
3. Configure real sandbox Auth confirmation and approved HTTPS redirects. Keep MFA
   enabled. Configure an existing approved test email service; Supabase default delivery
   may restrict recipients and rates. Do not disable confirmation or buy SMTP services.
4. Before publishing this branch, either verify automatic deployment is safely disabled
   for it, or verify sandbox-only Preview bindings and approve preview deployment.
   Git push and PR creation may themselves trigger Vercel; check behavior explicitly.
5. Prefer the existing Vercel project if safe: preserve each Production variable value
   and identity, remove its Preview scope only under approved scope-change plan, and
   create separate Preview variables containing sandbox values. Prefer generic Preview
   sandbox bindings so other feature branches cannot inherit source credentials; review
   branch overrides/older code compatibility. Restrict the test branch to Preview.
   Verify effective variable precedence and deployment target, not just intended settings.
6. If separating shared scopes is unsafe or conflicts with production release operations,
   propose an isolated `certverify-staging` Vercel project in the same team with explicit
   **Preview** deployments. Confirm cost first. Do not deploy it as Production merely
   because it is a new project. The code refuses sandbox releases in Production.
7. Configure the variable scopes below, run offline preflight, approve/deploy the exact
   validated Phase 8 head as Preview, and verify actual database endpoint/target. The
   preview build must refuse source credentials even when someone labels them staging.
   Record deployment ID, Git SHA, URL and non-secret sandbox ref in the evidence sheet.
8. Owner signs up/logs in to staging using an existing authorized email address they
   control, confirms it and enrolls TOTP at `/account/security`. This creates a separate
   staging Auth identity; do not transfer a production password/hash or grant metadata.
   Record staging Auth UUID privately and request explicit Super Admin assignment approval.
   Execute the reviewed `sandbox-owner-bootstrap.sql` only after verified TOTP and approval.
9. Run real A–F journeys and the 25-step owner checklist. Use actual consenting test
   inboxes, synthetic issuer/certificate data and only Razorpay test instruments. Keep
   browser contracts, local SQL and hosted results separate. Failed/incomplete journeys
   remain failed/incomplete even if earlier fixtures passed.

## Fresh staging SQL order

`npm run hosting:migrations` prints hashes only; it never applies SQL.

1. `supabase/staging/20261012_fresh_baseline.sql`
2. `supabase/proposals/20261012_stage1_account_security.sql`
3. `supabase/proposals/20261012_stage2_certificate_revocation.sql`
4. `supabase/proposals/20261012_stage3_branding.sql`
5. `supabase/proposals/20261012_stage4_platform_admin.sql`
6. `supabase/proposals/20261012_stage5_billing.sql`
7. `supabase/proposals/20261012_stage6_payments.sql`
8. `supabase/proposals/20261012_stage7_readiness.sql`

The baseline refuses existing application tables. It installs application schema,
explicit signup/profile/personal-account triggers, owner membership, safe random public
issuer codes, atomic account/year certificate counters, RLS and private defaults.
It relies on genuine managed Supabase Auth/Storage, never creates substitute services.
Numbering has intentional gaps after abandoned issuance and does not consume certificate
quota; trusted issuance triggers consume quota. Public IDs do not encode Auth user IDs.
Auth-linked history uses RESTRICT rather than legacy cascades, requiring reviewed soft
removal/retention procedures. There are no seeded users, admins, prices or entitlements.
Staging SQL application is tested in PostgreSQL with explicit Auth/Storage fixtures;
real hosted provider compatibility remains a gate.

## Separate existing-database reconciliation — source remains untouched

Do not execute the fresh baseline on source or restore synthetic staging into source.
Compare actual schema to the snapshot and all seven proposals. Inventory unowned or
multi-organization historical templates, ambiguous certificate numbers, issuer identity
at issuance, old subscriptions/paid periods and suspension state. Prepare explicit
ownership/branding/payment provenance mappings; never choose oldest membership, grant
free unlimited access or mark historical payments waived as a shortcut.

Review actual legacy SQL bodies/overloads and RLS callers. Advisor warnings about
anonymous definers are potential risks, not proof that every definer is exploitable.
Stage proposals intentionally expose three narrow public projections:
`cv_public_certificate(text)`, `cv_public_logo_path(text)` and `cv_pricing_catalog()`.
The catalog exposes currently visible plan terms, not customer billing/coupon records.
Others need authorization/body/grant review. Candidate SQL removes PUBLIC and direct
anon execution from curated legacy helpers/mutators; authenticated policy helpers retain
explicit execution only after their bodies/callers are verified. Candidates are printed,
not applied. They do not repair an unsafe body or all possible legacy functions.

Prepare source-compatible reconciliation/backfills and restore rehearsal separately;
source execution needs another approved release. Fresh tests do not establish source
compatibility. Supabase advisor must be rerun after any approved hosted staging install,
with intended public projections documented rather than blindly suppressed.

## Variable names and scopes — values never go in chat/repository

| Name | Vercel scope | Handling |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Preview only for staging; original Production retained | New sandbox HTTPS origin; never source |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Preview only for staging; original Production retained | Sandbox anon/publishable key; RLS still mandatory |
| SUPABASE_SECRET_KEY | Preview, server-only; original Production retained | Sandbox server credential; never public prefix |
| NEXT_PUBLIC_APP_URL | Preview | Stable approved HTTPS staging origin |
| CERTVERIFY_DEPLOYMENT_TARGET | Preview | isolated_sandbox |
| CERTVERIFY_SANDBOX_PROJECT_REF | Preview | Verified newly created ref, never source |
| CERTVERIFY_RATE_LIMIT_SECRET | Preview, server-only | Random >=32 characters |
| CERTVERIFY_PAYMENT_MODE | Preview | disabled until checks pass; then razorpay_test |
| RAZORPAY_TEST_KEY_ID | Preview | Test key ID only; safe public checkout identifier |
| RAZORPAY_TEST_KEY_SECRET | Preview, server-only | Test API secret |
| RAZORPAY_TEST_WEBHOOK_SECRET | Preview, server-only | Separate webhook secret |
| CERTVERIFY_READONLY_DATABASE_URL | Cloud inspection only | Real read-only role, trusted TLS, verified project |
| CERTVERIFY_DB_CA_FILE | Cloud inspection only, if needed | Trusted CA path, never disable TLS |
| VERCEL_ENV / VERCEL_URL | Provider supplied | Actual preview context/origin, never spoof for deployment |

Never bind SQL inspection or provider management credentials into the website. Live
Razorpay keys are unsupported and must be absent. Production payment mode remains disabled.
Auth redirect URLs, sender identity and Storage private bucket policies must be verified
on the new sandbox, not copied blindly from source settings.

## Protection, webhooks, operations and rollback

Private application paths require verified Auth; platform administration requires MFA
and explicit role. Public signup/email callbacks/QR verification are intentional public
endpoints. If provider-level protection restricts the whole preview to the owner, verify
inbox callbacks and Razorpay webhook delivery work with a narrowly approved exception.
Do not disable Production protection or assume a paid exception is free. If no safe
supported exception exists, mark real webhook testing blocked and propose a separate
approved staging setup; never put bypass secrets in repository/test reports.

Test authoritative captures and exact amount/currency; a client success message cannot
activate access. Replay signatures/events, wrong account/amount, quota races, declined
payments, renewal cancellation with prepaid future period, partial/full refunds and
reconciliation. No automatic recurring mandate is promised. More than one refund per
payment, dispute restoration, immediate proration, invoices/tax and commercial policies
remain reviewed launch work. Schedule bounded sandbox reconciliation only through
approved existing infrastructure; no paid scheduler is purchased.

Before environment edits record scope metadata and secure recovery references. Restore
Preview scopes/keys without changing Production if isolation fails; restrict the broken
preview immediately. Preserve immutable audit/payment/branding evidence. Disable test
collection/webhook intake before schema-compatible app rollback. Prefer reviewed forward
repair; sandbox restore needs verified backup plus gateway reconciliation. Never replay
uncertain order/refund POSTs. Retire staging only with approval after evidence is saved.


## Final evidence and owner quick check

Local continuation passed **235 tests**: 46 unit, 149 disposable PostgreSQL and
40 mocked browser, no failures/skips. TypeScript, lint and production build passed
(seven existing warnings). Genuine Supabase Auth/MFA/Storage/email, new Vercel staging
preview, Razorpay merchant sandbox and owner manual checks are **not run**.
The source security-advisor findings are owner-provided and await private body review;
no source finding is claimed fixed in the hosted database. Production dependency audit
has zero findings; full audit retains five high development findings. No independent
penetration test or production-readiness certification is claimed.

Once an isolated URL is actually verified, owner checks are:
1. Sign up/confirm email, log in, test password reset and sign out on PC/phone.
2. Enroll TOTP, obtain separately approved admin bootstrap, verify ordinary-user denial.
3. Create/edit sandbox plans/offers; activate trial and inspect quota/seat limits.
4. Create organization, invite new/existing users, switch accounts, remove a member.
5. Issue a certificate, download PNG/JPEG QR, scan on phone and confirm private fields
   stay hidden and Powered by CertVerify links correctly.
6. Approve branding change, compare historical/new issuer identity, revoke with reason.
7. Complete only test-mode Razorpay checkout; confirm verified capture/history, replay
   denial, renewal/cancellation/refund behavior and expiry restrictions.

Use the 25-row detailed checklist in `hosted-testing-preparation.md` for actual expected
results and a private timestamped evidence sheet. The next commercial gates remain real
integrations, verified source compatibility for any production migration, backups/restore,
monitoring/reconciliation, public/Auth abuse controls, commercial renewal/refund/retention/
tax terms, reviewed live-payment implementation/approval and independent security review.
Stage 8 OCR/AI remains postponed; no paid AI or real collection is activated.
