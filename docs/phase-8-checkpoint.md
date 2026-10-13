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


Latest owner update: new staging `nubohxesjeaodqcveiud` is active/healthy/initially empty;
Vercel Production/Preview Supabase entries are separate. Original source stays protected.
The owner now permits push and automatic Preview after fail-closed safeguards, even if
missing configuration causes the build to fail safely. This supersedes the previous
publication hold. Hosted SQL, Super Admin grants, Production, merges and live payments
remain unapproved. Follow `docs/phase-8-live-staging-handoff.md` and do not recreate staging.
Current safeguards pin this exact staging ref, require correct public/service key formats,
verify both read-only provider accesses before compilation without reading user payloads,
check runtime server clients, reject public secret bindings and Production origins, derive
Preview auth origin from provider hostname, and scan client JavaScript for secret literals.
Final publication validation passed **241 tests — 51 unit, 150 isolated PostgreSQL,
40 mocked browser**, no failures/skips. Type generation, TypeScript, lint and production
build passed (seven existing warnings); the build now includes a successful server-secret
literal scan across 41 client JavaScript files. Actual Next configuration refused source
binding before network access. Publish exactly one draft PR against Stage 7; record remote
CI and Preview results in the PR without claiming genuine hosted user journeys.

## Final staging continuation — 13 October 2026

Preserved the complete Phase 8 lineage through `9655b87260dd0b157fb9071d62836010e7e8375e`
and continued on the same PR #11 branch, without recreating previous stages.
The owner-reported deployment `dpl_7YnbHUHwB2UpUcug52eafvNveQmi` failed after the four
Preview staging flags/public credentials had already been repaired. Do not repeat those
settings blindly. The build previously required a service credential twice: in the shared
isolation guard and an eager admin client import. Both dependencies are now removed from
public compilation. Public configuration/credential validation still pins the approved
staging project and rejects source, leaked secrets and live payment modes. Privileged
operations verify the service credential at the pinned sandbox when invoked and return
503 on failure. No fallback database is permitted.

Installer 8 fixes a confirmed stale-session SQL authorization issue: banned/deleted/
anonymous/unconfirmed Auth identities cannot retain tenant or platform access through
existing AAL1/AAL2 claims. Central role/billing/discovery/invitation checks and profile
RLS enforce this; public verification and active-user billing on suspended accounts remain.
The new plain SQL bootstrap is compatible with connected management tools, fail-closed
with placeholders, and separately requires owner privilege approval plus real verified MFA.

The staging-only checkout demonstration presents approved/declined/cancelled outcomes
without any gateway request, payment record, coupon redemption or entitlement activation.
Trials or separately approved audited complimentary access support issuance testing.
It is not evidence of Razorpay sandbox settlement.

Complete validation: **271 tests — 65 unit, 164 disposable PostgreSQL 17, 42 mocked
browser**, zero failures/skips; TypeScript, lint, production build/client-secret scan
passed. Seven existing lint warnings remain; production dependency audit is clean.
The optimized local build exercised Preview configuration with the private Supabase key
absent and only the read-only public credential response stubbed. This is local build
evidence, not hosted integration evidence. Eight installer files remain, with the updated
installer 8 hash recorded in the print-only manifest.

No Supabase/Vercel management methods or provider identities are available in this task.
Do not retry known egress 403s or use unverified injected Supabase credentials. Current
staging emptiness and private-key validity remain unverified, hosted migrations and
administrator grant remain unapproved, and no genuine Auth/email/MFA/Storage/payment
journey has run. Follow `docs/phase-8-connected-tools-handoff.md` and
`docs/phase-8-migration-review.md`; operators perform routine technical work. The founder
only needs the specific staging/privilege approvals, their own MFA and customer testing.
Record the final commit, new CI/deployment outcomes and recovery artifact hashes outside
this self-referential checkpoint after publication. A build success is not a fully
functional website while these integration gates remain.
