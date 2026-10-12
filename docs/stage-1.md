# Stage 1: account context and invitation security

## Review scope

This branch builds on `fix/ci-lint-errors`, which already includes
`fix/team-invitations-and-auth`. It is intended as a stacked review; neither
existing PR is merged or changed by this work.

The dashboard lists active memberships and selects an account explicitly. A per-tab
sessionStorage hint becomes the `x-certverify-account` request header. The hint is
not authorization: new PostgreSQL helpers validate active membership on each request.
Switching performs a full navigation to discard the previous account's forms/state.
API handlers use the caller's verified bearer identity for organization operations;
the admin client is used only for Auth user lookup/email delivery.

The proposed database changes add restrictive RLS policies so legacy creator-only
policies cannot retain account access after removal. Templates receive `account_id`
and become readable organization-wide, manageable only by owner/admin. Members can
create and read their own certificates; owner/admin can read organization activity.
Existing viewer memberships remain read-only. Direct membership writes are denied;
RPCs support owner-controlled administrator assignment and soft membership removal.
Ownership transfer is deliberately outside ordinary member controls.

Invitation reservation, resend/cancel, acceptance and member changes serialize on the
account row, then the invitation/member row. Acceptance validates current verified
email, optional recipient binding, pending status, expiry and the exact token hash,
and commits membership, acceptance and audit together. Resending retires the previous
token in the same transaction as reserving its replacement. Removed administrators
return as members when reinvited. New invitations record required name/password setup;
acceptance checks the Auth password is established and a name is supplied.

Email delivery occurs after reservation. A provider failure cancels the new reservation;
failed cleanup is reported for administrator review. Do not interpret a provider
timeout as proof no email was sent. There is not yet a durable delivery outbox or
exactly-once email guarantee; add reconciliation before release.

## Email sessions

Invitation setup collects the user's name and matching password. Existing registered
users can sign in with their existing password and preserve the app invitation token;
unconfirmed existing users receive confirmation resend attempts, not forced resets.
Invitation acceptance selects the returned account before opening its dashboard.

Email proof is consumed explicitly through token-hash verification, PKCE exchange or
implicit callback session establishment. Password recovery never falls back to an
ordinary existing session. React effect replay shares a one-time token operation.
Login continuation links retain only the app invitation token, not Auth tokens.
Authentication URL material is removed after successful consumption; responses set
`Referrer-Policy: no-referrer`.

Public verification uses an anonymous client rather than the visitor's customer
session. Existing public verification behavior otherwise remains in place for Stage 2.

## Production blockers: do not apply or deploy yet

`supabase/proposals/20261012_stage1_account_security.sql` is intentionally outside
`supabase/migrations`. No command in CI applies it to a remote database.

Before promoting it to a deployable migration:

1. Inspect current live SQL function bodies, overloads, grants, triggers, RLS policies
   and Auth schema. The committed inventory is historical (October 10, 2026), excludes
   bodies/triggers' definitions and is not a full backup or an executable baseline.
   No database connection or management tool was available for full inspection.
2. Establish a reviewed baseline in an isolated Supabase project. Never reset or
   recreate production tables. Test coexistence with actual signup/profile/account
   triggers and the existing certificate-ID generator; its algorithm is preserved
   through a checked wrapper, not reproduced by the test fixture.
3. Backfill historical template `account_id` through an explicit reviewed mapping.
   Multi-membership users are ambiguous: do not assign their templates to the oldest
   account. The proposal does not guess, delete or move historical data. Unmapped
   templates will be inaccessible under the proposed policies.
4. Review revocation of legacy mutation RPC grants against all actual callers.
   In particular inspect remaining security-definer functions for bypass paths and
   assert removed users cannot call alternative mutation endpoints.
5. Configure and validate Supabase redirect allowlists and email templates in the
   isolated project for `/accept-invite`, `/reset-password`, `/confirm-email`, and
   Vercel preview URLs. Keep production and preview identities separate.
   Token-hash links should append `token_hash={{ .TokenHash }}` and the appropriate
   Auth `type` to the already parameterized `{{ .RedirectTo }}`; test the exact
   rendered URL. PKCE links require the requesting browser's verifier; token-hash
   templates are needed for reliable cross-device recovery. No live templates or
   settings were modified here.
6. Validate real new-user, existing-user, unconfirmed-user, wrong-recipient,
   expired/resend and recovery email journeys, plus cookie refresh/logout, against
   the isolated Supabase project. Actual SMTP/Auth integration remains unverified.
7. Add delivery reconciliation/outbox, invite rate limits and abuse controls before
   commercial launch. Review public table grants/private-field exposure and revoked
   certificate visibility in Stage 2; the existing public policy covers Active only.

Production migration, rollout, settings changes and deployment require the owner's
explicit approval after these prerequisites and reviewed backup/rollback steps.

## Automated checks

- `npm test`: unit tests for account selection, secure URL construction, email proof,
  effect replay, app-token continuation, reservation/delivery ordering and failures.
- `npm run test:db`: real PostgreSQL RLS/RPC tests in a newly created disposable Docker
  container. No database URL is accepted; network/ports/production credentials are
  unavailable. The fixture reconstructs metadata from the historical inventory and
  substitutes explicitly documented helper bodies. Tests validate this proposal,
  not the actual live functions or Supabase Auth implementation.
- `npm run test:browser`: Playwright journeys against the actual Next.js app with an
  isolated loopback Auth/PostgREST contract fixture. Includes new-user setup,
  existing-password acceptance, account switching, expired links and recovery.
  This is UI/SDK contract coverage, not real email delivery or live Auth verification.
- `npm run lint`, `npx next typegen && npm run typecheck`, `npm run build`.

For cloud Chromium already installed on PATH:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`.
Otherwise install Playwright Chromium with `npx playwright install --with-deps chromium`.
The browser test processes explicitly override injected production Supabase variables.
Do not run build and browser/dev checks concurrently: Next.js generated type/output
directories are shared. CI uses Node 22 and placeholder credentials, never remote SQL.

See [ROADMAP.md](ROADMAP.md) for Stages 2–7 and the owner's deferred Stage 8.

## Validation recorded for this review

The final cloud run used Node **22.23.3**, matching CI's major version:

| Check | Result |
| --- | --- |
| Unit tests | 15 passed; none skipped |
| Isolated PostgreSQL tests | 20 passed; none skipped |
| Chromium browser-contract journeys | 5 passed |
| Next.js type generation and TypeScript | Passed |
| ESLint | Passed with 0 errors and 7 warnings |
| Default `npm run build` (Turbopack, CI placeholders) | Passed |

The initial three browser failures were diagnosed individually: duplicate password
mismatch rendering in the application, and two missing PostgREST CORS-header allowances
in the isolated fixture. The application now renders form errors once; the fixture
supports `content-profile` and `accept-profile`. The PostgreSQL test harness also
waits for the final server after the official image's temporary initialization server,
preventing a startup race. These fixes retain all test assertions.

The remaining lint warnings include existing effect-dependency/navigation issues and
the intentional full navigation on account switching. They are visible, not globally
disabled. This validation does not establish live SMTP delivery, production RLS,
actual signup triggers, or the deployed Supabase function bodies.
