# Stage 4: platform Super Admin dashboard

Branch `feat/stage-4-platform-admin` starts at Stage 3 PR #6 commit `fe9707b`.
This is a stacked draft against `feat/stage-3-organization-branding`; PRs #4/#5/#6
are preserved. All SQL is an unapplied proposal and no production changes occurred.

## Implemented

- Dedicated `/platform-login` reuses the existing Supabase password/recovery/session
  implementation. There is no separate administrator password store. Safe same-origin
  redirects preserve platform destinations and invitation links. Customer login remains
  available; its shared form was extracted into a reusable component.
- Server-verified platform identity guards the `/platform` layout. Every reporting API
  and SQL RPC also checks confirmed email, an active explicitly seeded platform grant
  and verified MFA (`aal2`). Client MFA UI alone never authorizes operations. Organization
  owner/admin roles and editable user metadata never confer platform privileges.
- `/platform` reports registered accounts, individual/organization counts, registered
  users, certificates issued and Active/Inactive/Revoked totals. A UTC 30-day issuance
  chart and access/subscription distributions show exact counts rather than contents.
- `/platform/accounts` supports search by approved issuer name, code, reference or owner
  email; type, access-state and subscription filters; stable bounded pagination. Account
  inspection includes membership emails/roles/status/verification and removed records,
  certificate statistics and latest 50 activity headers. It excludes private certificate
  fields, internal revocation reasons, password hashes and raw user metadata.
- Authorized platform administrators can activate, deactivate, suspend and restore an
  account through a review/confirm flow. Every real transition requires a reason and
  expected state revision, locks the account, and records actor, timestamp, old/new state,
  reason and revision in both organization and platform audit evidence. Stale parallel
  actions fail instead of overwriting newer decisions; valid same-state retries add no
  duplicate transitions. No account/member/certificate is deleted or automatically revoked.
- Suspension/deactivation is enforced centrally by account authorization plus mutation
  guards, not just a banner. Certificate/template/field operations, account upgrades,
  member/invitation administration and acceptance, branding requests/scoped permission
  use and private logos/finalization are blocked. Locks serialize those operations with
  access decisions and recheck after waiting. Already committed operations remain historical
  evidence. Active memberships are retained; users can safely switch to another active
  account. Customer operations fail closed if access-state checks are unavailable.
- Public certificate verification, revocation status, immutable issuer names/logos and
  mandatory Powered by CertVerify attribution remain available during suspension.
- Stage 3 approve/reject/information and scoped grant/revoke flows remain available in
  the platform navigation. Review requests now have bounded pagination/status filters;
  active recipients are selectable by email rather than manually entering user IDs.
  The old unbounded queue RPC is no longer client-executable after this proposal.
- `/platform/audit` browses immutable administrative history, globally or per account,
  with bounded pagination. Successful platform report reads are audited as well as
  mutations. Organization audit records now have update/delete guards too. No raw
  cross-tenant table privileges or customer administrator self-assignment API was added.
- `/platform/subscriptions` provides informational sourced status summaries where
  available. Missing records explicitly read `unknown`. No subscriptions are seeded,
  no price/plan/quota is hardcoded, and no payment checkout, charge, webhook or automatic
  entitlement suspension is implemented. Trusted Stage 5 subscription services can
  replace the summary adapter without coupling customer access controls to prices.

## Migration and integration gates

`supabase/proposals/20261012_stage4_platform_admin.sql` stays outside deployable migrations.
Before any rollout, inspect actual live functions/roles/grants/triggers and existing
status/subscription mechanisms. The metadata fixture has no existing lifecycle column;
its active account baseline must **not silently reactivate existing live suspensions**.
Reconcile and preserve any live disabled-state history through a reviewed mapping.

See [Stage 4 Supabase integration](stage-4-supabase-integration.md) for the full isolated-
project MFA/access/concurrency/Storage matrix and release prerequisites. Read-only
inspection supports `npm run inspect:db -- --stage=4` (Stages 1 and 3 also selectable).
It enforces TLS verification, validates read-only transaction state and saves reports
in ignored private files. The current environment lacks a secure read-only DB URL;
the Stage 4 runner reports pending without attempting a production connection.

Actual Supabase Auth/MFA/Storage, live SQL bodies, historical template ownership,
historical issuer reconciliation and real invitation/recovery emails remain unverified.
Platform administrator bootstrap and any subscription imports need separate approval
before production use. Raw schema reports may contain sensitive function literals;
never commit them or supply secrets in chat.

Operational denied-attempt monitoring, high-volume report plans/audit capacity,
retention/archival and emergency admin procedures remain production-readiness work.
Pricing/entitlements are Stage 5, payments/lifecycle Stage 6. Billing reactivation pages
are not claimed complete in Stage 4. Stage 8 PDF/OCR/AI remains postponed.

## Validation

Final local run used Node 22.23.3 and non-production build placeholders:

| Check | Outcome |
| --- | --- |
| Unit tests | 23 passed |
| Isolated PostgreSQL tests | 71 passed |
| Chromium browser-contract tests | 24 passed |
| Total | **118 passed; 0 failed; 0 skipped** |
| Next.js type generation / TypeScript | Passed |
| ESLint | 0 errors, 7 existing warnings |
| Default Turbopack production build | Passed |

Stage 4 adds 3 unit tests, 18 PostgreSQL tests and 6 browser journeys. Coverage includes
MFA/confirmed-email/revoked privilege gates, self-assignment denial, metadata privacy,
filters/pagination, sourced unknown subscriptions, suspension/restoration, invitation
acceptance blocking, account switching, public certificate/logo preservation, concurrent
state decisions/issuance, immutable audit and the bounded branding approval queue.
The Stage 4 read-only SQL preflight executes without mutation in the isolated fixture.
The secure inspection runner correctly reports pending when the read-only URL is absent.

 Database tests execute
all four proposals in disposable real PostgreSQL for the Stage 4 suite, using a
metadata-based baseline and explicitly substituted legacy/Auth/Storage definitions.
Browser tests use real Chromium/Next.js with loopback Supabase fixtures, including
mocked signed-claim/MFA exchanges; they do not validate real email or deployed Auth.
All Stage 1–3 regression suites are included.
