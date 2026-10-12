# Phase 8 — hosted integration and owner testing

This phase prepares hosted QR testing. It is **not** postponed Stage 8 PDF/OCR/AI work.
No hosted migrations, privileged grant, production change, deployment or charge was made.

## Validated source and dependency chain

Stage 7 baseline: `573d511d23949c3a112c9e75f789c081bacee1cf`.
[Its CI passed](https://github.com/pvkreddy03/certverify/actions/runs/38253589986),
including 39 unit, 134 PostgreSQL and 38 browser tests, types, lint and build.
The Phase 8 preparation branch stacks on that exact commit and adds pre-bootstrap
account MFA, offline checks, an approval-only bootstrap operation and this checklist.
Do not deploy the baseline alone expecting the new account-security page.
Final local preparation validation: **220 tests passed (42 unit, 138 PostgreSQL,
40 browser)** with no failures/skips. TypeScript, lint and production build passed;
seven existing lint warnings remain. No new hosted integration or CI is claimed.

| Draft PR | Head branch | Validated source head | Base |
| --- | --- | --- | --- |
| #4 | feat/stage-1-organization-security | 236ef4885b67b5a0cbbc304f6997e2b21f60a05b | fix/ci-lint-errors |
| #5 | feat/stage-2-certificate-revocation | a4bc88b6625355a58fb6f3775edb87b8d250e717 | Stage 1 |
| #6 | feat/stage-3-organization-branding | fe9707bb97be2e09fe6572d67711005757ac3450 | Stage 2 |
| #7 | feat/stage-4-platform-admin | dca451ec166f843f7ec2c6aa21e67268c1ad5cab | Stage 3 |
| #8 | feat/stage-5-subscriptions-pricing | ceacb1362a5e12421c93cc08c435fa036aa6cf4a | Stage 4 |
| #9 | feat/stage-6-secure-payments | 54ef3a2b9e8ba8da354ff61f269d5dd49c10e008 | Stage 5 |
| #10 | feat/stage-7-integration-readiness | 573d511d23949c3a112c9e75f789c081bacee1cf | Stage 6 |

These PRs remain separate and unmerged. Inclusion is checked through Git ancestry;
Stage 7 CI does not certify every old PR against today's external infrastructure.

## Current blockers and evidence

| Requirement | Observed status |
| --- | --- |
| Supabase URL / anon / server key | Present, project purpose unconfirmed; not used for writes |
| Sandbox project ID and management access | Missing; owner reconnecting |
| Actual schema/function bodies via read-only SQL | Missing connection; snapshot omits function bodies and triggers |
| Vercel project/token or management connector | Unavailable |
| Sandbox Razorpay test keys/webhook secret | Missing |
| Preview URL, confirmed email delivery, genuine MFA and Storage | Not tested in this phase; existing Vercel preview is an older commit with unconfirmed DB binding |
| Hosted A–E scenarios / actual merchant events | Not run |
| Local PostgreSQL / browser fixtures | Useful code evidence; never equivalent to hosted Auth/Storage/payment |

GitHub records an existing Vercel Preview at previous Stage 7 head `102f1f3`.
Its deployment status is successful, but database binding is not visible and direct
HTTPS inspection returned proxy tunnel HTTP 403. This is neither final-source nor
isolated-service evidence. Keep this preparation branch local until automatic preview
binding is confirmed sandbox-only; then push/create a draft PR and check CI. No new
preview was triggered in this phase. Required network destinations, once scoped, are
`api.supabase.com`, the approved `<sandbox-ref>.supabase.co`, its verified database
host/pooler, `api.vercel.com`, the exact preview hostname and `api.razorpay.com`.
Preserve existing network rules; do not disable TLS or use proxy bypasses.

Use secure environment/provider settings for keys. Do not paste them into chat.
A reconnect alone does not identify sandbox scope. Record project ID, team, plan,
region and preview project. Verify zero-cost eligibility; ask approval before any
purchase, upgraded plan or charge. If a free separate project cannot be provisioned,
use an explicitly identified existing disposable project rather than production.

## Ordered execution and approval gates

1. Inspect connected Supabase/Vercel accounts read-only. Confirm sandbox project ID,
   repository binding, production branch/settings and free resource capacity.
   Keep existing production credentials out of the preview environment. Never import
   production customer records; use fake issuer names and consenting test inboxes.
2. Obtain secure `CERTVERIFY_READONLY_DATABASE_URL` for schema inspection. Run
   `npm run inspect:db -- --stage=1` and stages 3, 4, 5, 7. Reports are private/ignored;
   inspect actual functions, owner/grants, RLS, defaults, triggers, constraints,
   Auth signup behavior, Storage policies and certificate numbering. Review snapshot
   differences before a hosted apply request.
3. Prepare an actual sanitized legacy baseline for the separate project. **Seven
   proposals extend an existing schema; a new empty Supabase project is insufficient.**
   The test harness fabricates omitted helper functions and Auth/Storage tables.
   Never install those substitutes in hosted Supabase. Obtain and review real account
   creation/numbering functions and signup triggers before generating baseline SQL.
   Preserve Supabase-managed Auth/Storage ownership and genuine services.
4. Record baseline + seven proposal SHA256 hashes using `npm run migration:manifest`.
   Prepare a restorable sandbox backup and before/after row counts and grants.
   Request explicit approval naming the sandbox project, baseline, exact seven files,
   backfills and expected changes. **No hosted SQL executes before that approval.**
   Apply each transaction in the existing release-runbook order, stopping on errors.
   Any changed baseline/backfill requires renewed scope review; do not bypass RLS or
   assign unlimited entitlements to make the preview work.
5. Validate hosted SQL functions and privileges using anon/authenticated/service roles,
   true JWTs, concurrent quotas, removed members, expired plans and immutable history.
   Keep application credentials out of inspection reports and public logs.
6. Configure a separate Vercel project or branch-scoped **Preview** environment only.
   Link this repository and the Phase 8 branch, Node 22, Next.js preset, `npm ci`,
   `npm run build`, default Next output. Do not alter production branch, domain or
   shared Production variables. Verify the deployment records the exact tested head.
   Use the variables in `docs/release-runbook.md`; run `npm run hosting:preflight`
   with `VERCEL_ENV=preview` in that configured context. Offline success is not proof
   that credentials belong to the project or that any service works.
7. Set a stable sandbox HTTPS app origin in Preview `NEXT_PUBLIC_APP_URL`. Confirm
   Vercel's actual `VERCEL_URL` and email origin selection. Configure Supabase Site URL
   and exact callback/accept-invite/reset-password redirects for this preview; no
   broad wildcard or production origin. Use an existing approved test SMTP service
   and actual inbox recipients. Supabase default email restrictions/rate limits can
   block delivery; record actual limits rather than disable confirmation.
   Redeploy preview after build-time public variables change. Keep old emailed links
   valid only for their configured approved sandbox origin.
8. Verify preview protection permits owner phone/PC login and provider webhook POSTs.
   Do not disable project-wide protection or expose secrets. If an isolated preview
   needs a protection exception, document its scope and available plan costs first;
   do not pretend Razorpay can authenticate to a protected Vercel login page.
9. Execute owner signup → email confirmation → `/account/security` → authenticator
   enrollment → invalid/valid code checks. Never record QR/TOTP seed or password.
   MFA enrollment grants no platform role. Record the owner Auth UUID privately.
10. Request **separate explicit owner approval** for first-admin assignment, naming
    sandbox project and owner Auth UUID. Review
    `supabase/operations/sandbox-owner-bootstrap.sql`. Execute only with verified
    sandbox connection and psql variables `owner_user_id`, `approval_reference`,
    `sandbox_project_ref`; the operation requires verified TOTP, confirmed account,
    no prior administrator and writes grant/audit atomically. Those variables record
    approval and project, but cannot authenticate the operator or prove DB identity.
    `granted_by` stays null because the privileged database operator is not falsely
    represented as an authenticated platform administrator. Audit records identify
    the grant recipient, operator and approval reference. No public grant endpoint exists.
11. Sign in at `/platform-login`, challenge TOTP, inspect accounts/branding/pricing and
    audit. Repeat with ordinary owner/admin/member accounts and stale/aal1 tokens:
    access must fail even after those users enroll their own MFA.
12. Create clearly named sandbox-only catalog plans/offers in the MFA admin UI. Prices,
    seats, currency precision, trial quotas and promotional durations are editable;
    use explicit expiry dates and do not silently seed actual commercial prices.
    Create several consenting test users through real signup/invitations.
13. Configure only Razorpay test keys in Preview, verified sandbox ref, random
    >=32-character rate secret, `CERTVERIFY_DEPLOYMENT_TARGET=isolated_sandbox`,
    `CERTVERIFY_PAYMENT_MODE=razorpay_test`. Initially leave payments disabled until
    migration/authorization checks pass. Never copy live credentials.
    Configure HTTPS `/api/payments/webhook` with its separate secret and supported
    events from the runbook. Record capture settings and use only provider-documented
    test payment instruments. Never put a real card into a test experiment.
14. Execute and record the manual checklist below and hosted security scenarios.
    A browser success callback is not payment success. Confirm capture authoritatively,
    durable ledger entry, one active period and exactly-once coupon consumption.
    Test pending/authorized/failure/refund/cancellation paths separately.
15. Run full validation for the final deployed source, inspect CI, and record hosted
    evidence. Report working preview URL only after actual browser/HTTPS checks.
    Staging-ready requires real integrations and resolved launch gates; production
    requires another explicit approved release. No PR merge is required for preview.

## Owner manual testing checklist

Use a phone and PC browser. Make one owner account, one individual professional,
organization A owner/admin/member, organization B owner, new invitee and existing-user
invitee. Use separate browser profiles or sign out between roles. Use actual test inboxes,
never fabricated email addresses for real delivery. Record IDs/timestamps and redacted
results in a private evidence sheet, not secrets or personal certificate contents.

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Signup, confirm email, sign in, sign out | One individual account; protected pages deny signed-out access |
| 2 | Forgot password; use new link; retry expired/reused link | Matching new passwords; invalid links explained; sessions reviewed |
| 3 | Open `/account/security`, enroll authenticator, invalid then valid code | Real verified TOTP; no automatic Super Admin access |
| 4 | After approved bootstrap open `/platform-login` | MFA required; overview, accounts and audit visible |
| 5 | Try platform screens as ordinary owner/admin/member with MFA | All platform data/actions denied |
| 6 | Upgrade individual to organization; invite new user from Team | Setup page asks name/password/confirmation before dashboard |
| 7 | Invite existing user to B; authenticate with old password | Same Auth identity; membership added; account switch works |
| 8 | Resend/cancel/expire/reuse invite; wrong recipient | Old links cannot accept; no duplicate membership or password reset |
| 9 | Remove member; retry with original open session | Subsequent tenant operations denied; history preserved |
| 10 | Admin creates sandbox plans, trial, coupon and expiry | Prices/quotas/seats editable; invalid offers denied server-side |
| 11 | Select trial or test plan; review usage/seats/renewal | Correct tenant terms; members cannot administer billing |
| 12 | Create template with required, optional, public and private fields | Required values enforced; tenant-specific template ownership |
| 13 | Issue certificate; download PNG and JPEG QR; scan on phone | Correct unique ID and public page; private fields hidden |
| 14 | Upload genuine PNG/JPEG/WebP logo under 2 MB; reject SVG/oversize | Private centrally stored image; unauthorized upload denied |
| 15 | Request branding change; admin approve/reject; scoped permission expire/revoke | Immutable responsible-user history; unauthorized editing denied |
| 16 | Issue before and after company-name/logo change | Old issuer snapshot preserved; new issue uses new approved branding |
| 17 | Inspect public verification footer | Clickable Powered by CertVerify attribution, correct official link |
| 18 | Revoke with reason; try ordinary reactivation; issue linked replacement | Revoked remains publicly identifiable; no ordinary reactivation |
| 19 | Tamper checkout amount/tenant/coupon; repeat callback and webhook | Server quote used; cross-tenant denied; one financial settlement |
| 20 | Complete Razorpay test checkout, authorized/captured/failed paths | Only authoritative capture activates paid access |
| 21 | Renew/change plan, cancel renewal with future prepaid period | Scheduled boundaries honored; paid future access preserved |
| 22 | Consume certificate/seat quota concurrently, revoke a certificate | Limits hold; revocation does not restore generation quota |
| 23 | Expire subscription; retry paid features; scan old QR | Paid operations denied; billing/renewal and public verification remain |
| 24 | Test partial/full refund and reconciliation in platform Payments | Partial access retained; full linked-period access blocked; history intact |
| 25 | Suspend/restore A with reason; inspect B and public certificate | A customer actions blocked, B isolated; public history remains |

Renewal/expiry tests may need short sandbox catalog periods or reviewed time fixtures;
never edit immutable financial rows or production clocks. Recurring mandates are not
implemented: manual renewal is not promised automatic charging. Additional refunds and
dispute restoration remain reviewed support work. Test forged signatures, parallel
captures, late/suspended-owner payments, quota races and raw REST/RPC tenant attacks
through controlled sandbox scripts after project verification; record HTTP/SQL denials.

## Evidence and rollback

For each hosted check record deployed commit, sandbox project, UTC time, test identity
alias, outcome, sanitized HTTP/SQL/provider reference and cleanup action. Start every
check as **not run**. Never upgrade a status based on fixture tests or an HTTP 200 alone.

Sandbox rollback: disable test collection, pause webhook/job intake, preserve gateway
references and audit evidence, roll back to a schema-compatible preview deployment or
apply reviewed forward repair. Restore only from a tested isolated backup after reconciling
external captures/refunds. Never drop audit/financial tables, overwrite historical branding
or regenerate orders/refunds automatically. Revoking a bootstrap grant requires a reviewed
privileged update `active=false` plus a new immutable audit event in one transaction;
do not delete the original grant audit. All hosted migrations and privileged assignments
remain approval-gated even in this isolated environment.

Known gates: real schema/signup/numbering/ownership compatibility, actual Auth/MFA/email/
Storage, merchant integration, public/Auth abuse controls, job scheduling/monitoring,
backup restore, official attribution domain, commercial refund/tax/retention terms,
five previously reported high development dependency findings and independent security
review. The production dependency audit was clean at Stage 7; recheck current advisories.

## Connection verification after owner reconnection

The owner reconnected Supabase and Vercel in ChatGPT. In this Codex Cloud task,
the exposed tool catalog still contains no Supabase/Vercel management methods or
connector-discovery search. No management tokens, read-only database connection,
Vercel team/project binding or approved sandbox ref were injected. Do not call this
a successful Cloud connection merely because ChatGPT displays a connected plugin.

The configured public Supabase project ref is `jhnxztaqfikgvkshifel`. Its project name,
organization, billing tier and production/sandbox purpose are not visible. Treat it as
potential production and perform no writes. GitHub lists Vercel deployments labelled
Preview (`production_environment=false`), including the prior Stage 7 head. This proves
only the Git deployment environment label, not that its Supabase data is isolated.
Neither a production nor a sandbox project inventory has been verified.

Exact access steps (no laptop software required):

1. In the selected Codex Cloud task/environment, attach available Supabase and Vercel
   integrations if the product supports exposing them here. Verify actual callable
   project-list/read tools, not just ChatGPT connection status. If a connection change
   requires a refreshed task, retain this checkout/branch and checkpoint; resume rather
   than recreate features. Never assume a new task automatically inherits plugins.
2. If management tools cannot be attached, supply scoped `SUPABASE_ACCESS_TOKEN` and
   `VERCEL_TOKEN` through secure Cloud environment settings. Use read-only/project-scoped
   provider permissions where available. These are separate from application anon/
   server Supabase keys; existing app keys cannot list provider projects. Do not paste
   tokens in conversation or replace existing application credentials blindly.
3. Identify public Supabase project refs/names and Vercel project/team IDs; specify
   which existing projects are production and which are disposable sandbox. Record
   `VERCEL_PROJECT_ID`, `VERCEL_ORG_ID` and the **approved**
   `CERTVERIFY_SANDBOX_PROJECT_REF` securely in environment settings. Scope any later
   preview configuration to that exact sandbox branch/project; keep production untouched.
4. Bind `CERTVERIFY_READONLY_DATABASE_URL` from a genuine read-only inspection role
   through secure settings, with trusted TLS and verified project identity. Provide
   `CERTVERIFY_DB_CA_FILE` if required by the database's CA. Do not use app service keys
   as a substitute for missing SQL function bodies. Do not grant public inspection RPCs.
5. Allow required provider API, approved sandbox/project database and exact preview
   hosts through the existing Cloud network settings without replacing unrelated rules.
   Current preview and credential-free Supabase health requests fail at the egress tunnel
   with HTTP 403. An additive environment draft now includes the provider APIs, exact
   existing Supabase host and exact older preview host, preserving the known GitHub/Fonts
   rules and package-manager presets. This is saved preparation, not a runtime or
   hosted configuration change. Review/apply these Cloud environment network settings
   before retrying; add a separately verified sandbox/database hostname when known. This is a network
   restriction, not evidence that Vercel authentication or the app itself failed.
6. Recheck actual tools/variable presence and make read-only project-list/schema requests.
   Then prepare the reviewed baseline and precise approval requests. Hosted migration,
   privileged bootstrap, preview deployment and any production operation all remain
   unapproved under the owner's latest instruction. Do not push this feature branch if
   existing automatic Vercel integration would deploy it before deployment approval.
7. After those approvals and sandbox checks, configure isolated Preview app variables,
   test email, Auth/MFA/Storage and `RAZORPAY_TEST_*` secrets from the test dashboard.
   The owner can enter their own password/TOTP without revealing either to this agent.

Keep completed code/tests/documents intact while access is resolved. Readiness remains
local preparation complete with hosted integration blocked, not staging/production ready.
