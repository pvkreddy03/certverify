# Phase 8 — publish and prepare real staging tests

## Confirmed updates and preserved source

Owner-verified staging: `certverify-staging`, reference `nubohxesjeaodqcveiud`, organization
`vgaakofkotxijchzpkgo`, ap-south-1, active/healthy and initially empty. Protected source
`jhnxztaqfikgvkshifel` remains unchanged. Vercel `certverify` project
`prj_yX5ltq28CGjvTo9iM7OtDH1A4z74`, team `pvkreddy03`, now has separate Production and
Preview entries for the three Supabase bindings. This supersedes the earlier shared-scope
blocker; the Preview secret's actual validity still needs verification.

Preserve commits `16e0e83` and `5b721ed`, on validated Stage 7 base `573d511` in PR #10.
The owner now permits the feature push/automatic **Preview** build after fail-closed
safeguards are confirmed. No merge, Production deployment, hosted SQL application,
Super Admin grant, paid resource or live payment is authorized.

## Preview safeguards and build interpretation

- Preview URL/ref must exactly equal the approved staging project. No fallback project
  or alternate credential is used. Runtime server-client creation checks the same guard.
- Public keys must be anon/publishable, never service-role/secret. Legacy key claims
  must match the staging project and role. Before compilation, Preview checks only
  the public credential with read-only `GET /rest/v1/` at the pinned staging host.
  This check does not need a private server key or populated application tables.
  Successful JSON is required; redirects/timeouts/errors stop the build.
- Privileged clients are created lazily after authorization. Invitations, private
  logo storage and payment settlement validate the server key's format/role/project
  and then verify its capability with read-only
  `GET /auth/v1/admin/users?page=1&per_page=1` at the same pinned host. No user body
  is parsed or logged. Missing, incorrect or revoked credentials return a safe 503
  for that operation. They cannot cause a fallback to the original database.
  A successful public build does not prove privileged services are configured.
  If the public key was mistakenly copied into the private binding, public pages
  can still compile; the runtime rejects it as a privileged credential. Real and
  unknown private values remain included in the client-secret scan.
- Every public binding is checked for secret names/role/prefix or a copied private key.
  Build/client JavaScript is scanned for server-secret literals and common encodings;
  negative tests prove detection without echoing values. `npm run build` includes this
  scan after Next compilation, so deployment cannot proceed on a detected client leak.
  CI uses fake credentials. Verify the effective Vercel build command uses this script;
  do not bypass it with a bare `next build`.
- `VERCEL_URL` must be the provider-supplied hostname for this project's team. Preview
  derives `NEXT_PUBLIC_APP_URL` from it. Leave that app URL unset in Preview, or match
  the exact current deployment origin; inherited Production URLs safely fail.
- A >=32-character private request-budget secret is required. Payments are unset/disabled
  by default; only complete Razorpay test settings are allowed. Live IDs/mode and
  sandbox declarations on Production are refused.

A failed build with missing flags or an invalid public credential is a safe refusal,
not proof the app is deployed or functional. A successful build's read-only checks prove
credential access, not signup/MFA/Storage/customer/payment journeys. Old deployments
retain old bindings and must not be used for writing tests.

## Exact connected-tools actions before a successful Preview

Using the separately connected Vercel/Supabase management tools, without printing keys:

1. Confirm the existing staging identity and current effective Preview scopes/branch
   overrides. Do not recreate the project or change Production values/scopes.
2. Preserve the three already configured Preview Supabase entries. Verify their target
   and service role through secure interfaces and the new runtime checks. Do not
   infer private-key validity from a successful build.
3. Preserve the four already configured Preview staging flags and request-budget
   secret. Inspect effective branch scopes only if a new failure identifies a
   specific problem; do not repeat completed setup or alter Production entries.
4. Keep provider `VERCEL_ENV`/`VERCEL_URL` automatic. Remove only a stale Preview
   `NEXT_PUBLIC_APP_URL` binding if necessary; never alter Production's origin.
   This build derives the current HTTPS deployment origin automatically.
5. Inspect the Phase 8 branch build/deployment at the exact published PR head. A new
   Preview build is required after settings change. Preview is authorized; Production
   deployment/merge remains forbidden. Return status, commit and URL only, no log keys.
6. After a URL exists, configure staging Auth Site URL and exact confirmation/recovery/
   invitation redirect origins for it. Match real links produced by this build. No broad
   wildcard, Production origin, disabled confirmation or unapproved paid SMTP service.
   Changing deployment hostname requires redirect review; old previews stay excluded.

Cloud management endpoints remain unavailable/restricted; do not repeat prior 403
requests or request tokens/passwords in ordinary chat. Connected tools can perform this
handoff separately. GitHub CI is reachable independently.

## Eight-file fresh migration order — separate approval required

Record hashes using `npm run hosting:migrations`. Before approval, confirm both public
application tables and Auth users are empty. Do not start signup before migrations.
If prior staging Auth signups exist, prepare an approved account-initialization mapping;
do not delete users or assume repeating signup will replay a trigger.

Apply only to `nubohxesjeaodqcveiud`, through an explicitly approved hosted operation:

1. `supabase/staging/20261012_fresh_baseline.sql`
2. `supabase/proposals/20261012_stage1_account_security.sql`
3. `supabase/proposals/20261012_stage2_certificate_revocation.sql`
4. `supabase/proposals/20261012_stage3_branding.sql`
5. `supabase/proposals/20261012_stage4_platform_admin.sql`
6. `supabase/proposals/20261012_stage5_billing.sql`
7. `supabase/proposals/20261012_stage6_payments.sql`
8. `supabase/proposals/20261012_stage7_readiness.sql`

These are **one-time transactional proposals**, not a rerunnable installer. Each file
has BEGIN/COMMIT. Stop at the first failure and verify rollback; retry only that failed
file after diagnosis/approval. Record successful versions/hashes in the provider migration
ledger or a private execution log. Do not replay completed files, skip errors, add blanket
IF NOT EXISTS, strip policies/grants, or drop data to make a rerun work. A lost response
requires read-only schema/version inspection before deciding whether it committed.

Fresh baseline refuses existing application tables or Auth signups. It requires genuine
managed Supabase Auth/Storage; never execute test harness substitutes in hosted services.
The eight SQL files contain no connection/reference to the protected source project.
Account defaults/profile/signup triggers, tenant RLS, member roles, safe definer paths,
private function/table grants, atomic numbering, paid quotas/seat concurrency and all stage
dependencies are exercised in disposable PostgreSQL. Storage creates a private
`certverify-branding` bucket with 2 MB/WebP restrictions and tenant object policies;
application validation accepts genuine PNG/JPEG/WebP, re-encodes, rejects SVG/oversize.
Actual managed ownership/grants/SMTP remain hosted integration checks.

To remove technical catalog setup from owner acceptance testing, the separately
approval-gated `supabase/operations/sandbox-demo-catalog.sql` prepares a clearly
synthetic free-trial plan after all eight installers. It is a data seed, not a ninth
migration. Its stored editable terms are 7 trial days, 5 certificates and 3 total seats.
Immutable evidence identifies the real database operator without impersonating owner
JWT/MFA or granting platform privileges. No users, subscriptions or payments are created.
Customers choose this trial through the existing server-validated subscription flow;
ordinary credentials cannot execute the seed and replay refuses.

After approval/apply, verify grants, advisor results, constraints, triggers, Storage
policies and zero customer-data imports. Three intended public definer projections are
catalog/certificate/logo; inspect bodies rather than blindly revoke them. Source legacy
advisor reconciliation stays separate and unapplied. Keep restores/forward repairs
approval-gated; never erase audit/payment/issuer evidence or replay uncertain gateway POSTs.

## Ordered genuine test sequence and evidence

All hosted journeys start **not run**. Record commit, staging project, UTC timestamps,
identity aliases, sanitized outcome/IDs and expected denial. Keep JWTs, QR/TOTP seeds,
passwords, keys and private certificate values out of reports, traces and screenshots.

1. **Auth:** after migrations, consenting test inbox signup → confirmation → login/logout;
   verify one personal account and profile. Recovery fresh/expired/replayed link and safe
   session cleanup. Confirm actual emails and redirect destinations, not mock HTTP success.
2. **Super Admin foundation:** the owner uses an existing authorized email, establishes
   their separate staging account and enrolls/validates TOTP at `/account/security`.
   Ordinary users can enroll MFA without gaining platform roles. Record staging Auth UUID
   privately; request separate explicit bootstrap approval. Apply reviewed
   `supabase/operations/sandbox-owner-bootstrap-management.sql` through connected
   tools only after approval and genuine
   verified factor. Test aal1 denial, aal2 access, revoked privilege and audit evidence.
3. **Catalog/trial:** MFA admin creates synthetic sandbox plans and offers, configurable
   prices, seats/quota, dates and coupon limits. Owner selects trial/free plan; no automatic
   unlimited entitlements or hardcoded commercial prices are seeded.
4. **Organization:** upgrade individual → organization, invite new/existing identities,
   complete new-user name/password setup, preserve existing credentials, accept B
   membership and switch A/B. Resend/cancel/expire/replay/wrong-recipient tests; remove
   member and verify the old session loses access while issuance history survives.
5. **Certificates:** create tenant templates and required/optional public/private fields;
   issue, inspect creator/audit/quota, download PNG/JPEG QR and scan from phone. Test
   concurrent IDs and generation quotas, cross-tenant template/record requests and
   invalid fields. Public verification must not expose private data.
6. **Branding/revocation:** real logo upload/read denial across tenants; request/approve
   branding, scoped permission expiry/revocation, issue before/after change and preserve
   historical identity. Revoke with mandatory reason; reject ordinary reactivation;
   linked replacement and mandatory clickable Powered by CertVerify attribution.
7. **Administration:** account search/statistics without private contents; suspend/restore
   with reasons/audits. Suspended/expired paid features deny, while billing/renewal and
   previous certificate verification behave as designed.
8. **Razorpay test-only:** securely configure `RAZORPAY_TEST_KEY_ID`,
   `RAZORPAY_TEST_KEY_SECRET`, separate `RAZORPAY_TEST_WEBHOOK_SECRET` in Preview;
   switch Preview mode to `razorpay_test`. Configure exact HTTPS `/api/payments/webhook`
   and approved protection exception if needed, without paid upgrades or Production
   changes. Use provider-documented test instruments, never real cards/live keys.
   With payments disabled, the isolated Preview offers a checkout demonstration
   for verified active account owners. It has explicitly labeled approved/declined/
   cancelled outcomes; it does not record payments, activate subscriptions, consume
   coupons, change quotas or call a gateway. Use a free trial or separately approved
   audited complimentary entitlement to test issuance. This is not Razorpay evidence.
9. **Financial lifecycle:** trial → quote → checkout → authoritative captured settlement;
   compare amount/currency/receipt, one period and audit history. Authorized/pending/
   failure cannot activate. Test renewal, change/cancel renewal with future prepaid
   access retained, partial/full refund, expiry/quota denial and continued public QR.
   No automatic mandate, immediate proration or multiple-refund guarantee is claimed.
10. **Adversarial:** forged client prices/success, wrong amounts/currency/tenant, invalid
    webhook signatures, duplicate/replayed/out-of-order events, concurrent settlement/
    quota issuance, removed/suspended payer and raw REST/RPC/RLS privilege attacks.
    Verify service role has only the intended financial RPC grants; inspect immutable
    financial/branding/admin audit. Reconcile partial failures without duplicate POSTs.

Local unit, real disposable PostgreSQL and mocked browser results remain separate from
these genuine hosted outcomes. The detailed 25-step owner checklist is in
`docs/hosted-testing-preparation.md`. Missing migrations, real inbox/SMTP, owner MFA/
approval, Storage and merchant test configuration must remain explicit blockers.
No production-readiness claim is supported yet. OCR/AI remains postponed.


Latest local continuation validation: **279 passing tests — 66 unit, 171 PostgreSQL,
42 mocked browser**, no failures/skips. TypeScript, lint and integrated production build/
client-secret scan passed; seven existing warnings remain. No real signup, MFA, Storage,
email or Razorpay merchant flow has run. The local optimized build exercised the exact
Preview configuration with no private Supabase key and a stubbed read-only public
credential response. That proves compilation behavior, not hosted credential validity.
An additional optimized Preview-configured build also passed with the private binding
mistakenly containing the public key; it remains invalid for every privileged call.
Production dependency audit reports zero vulnerabilities. The future Vercel build's credential
checks are narrower read-only evidence and must not be reported as these user journeys.
