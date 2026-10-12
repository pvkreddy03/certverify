# Stage 2: certificate status and revocation

Branch `feat/stage-2-certificate-revocation` starts from Stage 1 commit `236ef48`
(PR #4, already created through the owner's GitHub connection). No duplicate PR #4
or network change for PR creation is needed. No production migration is applied.

## Implemented behavior

- Owners/admins can mark a selected-account certificate Inactive, restore it to
  Active, or revoke it. Members cannot change status through the UI or RPC.
- Revocation requires an internal reason (maximum 2,000 characters). A separate,
  optional public explanation (maximum 500 characters) is the only reason exposed
  publicly. Blank/whitespace-only internal reasons fail in both UI and PostgreSQL.
- The transactional RPC records previous status, actor, account, time and an audit
  event. It locks account then certificate, rechecks active admin membership and
  rejects cross-account IDs. Concurrent/retried revocations preserve the first
  record and produce one revocation audit, not duplicate or overwritten evidence.
- Revocation is permanent. Direct update/delete privileges are removed; guards
  prevent deleting certificates, changing issuance identity or editing revoked
  records. Field edits take shared account/certificate locks so revocation and
  member removal serialize against evidence changes. Revoked fields cannot be
  edited, removed or appended through the application.
- New issuance accepts Active/Inactive only. Linked replacements must reference
  an accessible revoked original in the same account; the original stays revoked.
- A read-only public RPC returns an explicit projection of issuer name, certificate
  number, issue time, status, public explanation/time and public fields. It omits
  creator/account/actor IDs, internal reasons and private fields. Direct anonymous
  certificate/field-value table reads, including column grants, are revoked.
- Public pages distinguish Active, Inactive, Revoked, missing records and temporary
  lookup failure. No cached validity result is reused after revocation. Public lookup
  does not log scans or consume certificate-generation quota, AI tokens or paid APIs.
- New QR links use a unique stable public UUID; PNG and JPEG downloads are supported.
  Existing human-readable links remain valid where they identify one record. The
  historical snapshot includes a global unique index on certificate numbers, which
  is preserved. An ambiguous-label test deliberately models a degraded schema only
  in a disposable fixture; the application proposal never removes the global index.

## Stage 1 issue found by positive issuance tests

Stage 1's restrictive certificate SELECT policy called a STABLE helper that queried
the new row by ID. That row is not visible in the helper's statement snapshot during
`INSERT … RETURNING`, so creation could fail despite a valid insert check. Stage 2's
proposal replaces that policy with equivalent authorization using inline row account
and creator attributes. Positive issuance/replacement tests cover the correction.

## Unapplied proposal and release prerequisites

`supabase/proposals/20261012_stage2_certificate_revocation.sql` intentionally lives
outside deployable migrations. It requires the reviewed Stage 1 schema and ownership
backfill. See [stage-1-supabase-integration.md](stage-1-supabase-integration.md) for
the separately prepared live inspection and real-email matrix.

Before applying to an isolated Supabase project, inspect actual existing status
functions, triggers, table/column/function grants, public views and scan-recording
functions. Ensure no legacy SECURITY DEFINER path can mutate status without audit or
expose private values. Do not infer that historical metadata substitutes for live
function bodies. Test compatibility with actual signup/ID/timestamp triggers.

The proposal adds public UUIDs to existing rows. Assess row counts, lock duration,
backup and rollback strategy before any production rollout. Historical revoked
records may lack a reliable reason, actor or time; CHECK constraints are initially
NOT VALID so historical evidence is not fabricated. Reconcile those records explicitly
before validating constraints. The public page identifies an already-revoked legacy
record even if its historical reason/time was not recorded.

Issuer name currently comes from the account. Immutable issuer branding versions and
logos are Stage 3 work; this branch does not claim historical branding is implemented.
Certificate retention policy needs owner approval before any future purge mechanism;
there is no automatic deletion on revocation or subscription expiry. Public access is
independent of subscription entitlement. Scan analytics are not written by this
read-only lookup; reviewed abuse-resistant scan recording remains separate work.

Live email integration, actual schema/body/grant inspection, production migration
application, merging and deployment remain pending approval/access. Stage 8 stays
deferred; QR verification uses Supabase only.

## Validation

Final run on Node 22.23.3:

| Check | Outcome |
| --- | --- |
| Unit tests (Stages 1–2) | 17 passed |
| Real isolated PostgreSQL tests (Stages 1–2) | 34 passed |
| Chromium browser-contract journeys | 13 passed |
| Next.js type generation / TypeScript | Passed |
| ESLint | 0 errors, 7 warnings |
| Default Turbopack production build, CI placeholders | Passed |

No tests were skipped. Browser coverage includes private/public revocation reasons,
permanent revocation UI, Inactive/Active transitions, member controls, each public
status, unavailable lookup, canonical QR URL and actual PNG/JPEG file signatures.
PostgreSQL coverage includes races, cross-account and unauthorized calls, immutable
revocation evidence, linked replacements, mandatory reasons and authoritative issue
timestamps. The inspection SQL also completed as read-only in the isolated database.

The browser fixture is not real Supabase Auth/SMTP. The PostgreSQL baseline uses the
historical metadata inventory and test substitutes for legacy helper bodies. These
results validate the new proposals locally, not the deployed production schema.
The live inspection runner correctly reported missing secure read-only connection
configuration; it did not attempt a production connection.
