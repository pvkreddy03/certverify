# Stage 3: organization and professional branding

Branch `feat/stage-3-organization-branding` starts at Stage 2 PR #5 commit `a4bc88b`.
PR #4 and PR #5 are unchanged. This is a stacked draft: review the Stage 3 diff against
`feat/stage-2-certificate-revocation`, not against main.

## Implemented behavior

- One current approved name, public professional details and logo per account,
  with the same workflow for individual professionals and organizations. Approved
  branding appears on template pages, certificate lists, account settings and team
  names. New certificates capture an immutable issuer version in the issuance
  transaction; certificate details and public QR pages use that frozen version.
- Customer owners/admins can upload a proposed logo and request a change. Members
  can view approved identity and historical versions, but cannot edit names, mutate
  branding tables or submit requests. Pending proposals/logos are restricted.
- A separate, explicitly seeded platform administrator with confirmed email and
  verified MFA (`aal2`) can approve, reject with reason, request more information,
  or grant/revoke a temporary editing permission. The requester cannot approve their
  own request. Customer ownership does not create any platform privileges. The
  minimal `/platform/branding` review queue is the Stage 3 foundation, not a full
  Stage 4 dashboard, and has server-side plus database authorization.
- A permission is limited to the account, exact immutable proposal/changed fields,
  recipient and deadline (at most seven days; the UI chooses 24 hours). It is usable
  once and cannot change arbitrary values. Expiry, revocation, member removal, wrong
  user/account and replay fail closed. Customer access removal serializes against
  upload finalization and permission use through the existing account lock.
- Requests, decisions, information responses, grants, revocations, uploads and final
  changes have audit evidence. Approved versions, certificate-version associations,
  ready logo metadata and platform audit rows reject update/delete. Review history
  exposes prior versions, responsible user/approver, dates, reasons, permission events
  and name/logo change counts; historical logo objects are retained.
- Private Supabase Storage services are modular under `lib/branding`. Uploads allow
  genuine static PNG/JPEG/WebP at most 2 MiB/4096 pixels per dimension, then re-encode
  metadata-free WebP at most 1024 pixels. SVG, MIME spoofing, corrupt and oversized
  files are rejected. Server-generated tenant paths are never overwritten. Ten
  reservations per account per rolling 24 hours bound abandoned upload attempts.
- Restrictive Storage policies protect this bucket even alongside permissive legacy
  policies. Customer clients cannot insert/update/delete its objects directly. The
  server rechecks asset/tenant permission for private reads. Anonymous logo access
  only resolves through a publicly verifiable certificate's frozen version, never a
  pending upload. Public logo cache is short; public status is always fetched fresh.
- Every public verification result, including missing/error pages, has the mandatory
  clickable **Powered by CertVerify** attribution pointing to the official app homepage.
  Existing Stage 2 status/revocation/QR behavior and private-field filtering are reused.

## Historical evidence and live release gates

The proposal does not guess historical issuer identity or modify revoked certificate
rows. Existing certificates need an evidence-based, reviewed immutable version mapping
before release. An unmapped historical record displays “Issuer information unavailable”
while preserving its actual status and fields. Do not deploy until reconciliation is
complete. This avoids substituting today's mutable company name for historical evidence.

See [Stage 3 Supabase integration](stage-3-supabase-integration.md) for read-only inspection,
proposal ordering, real Storage metadata/policy checks, MFA bootstrap/session checks,
historical mapping and concurrency/failure tests. Stage 1 actual SQL bodies, historical
template ownership and real invitation/recovery emails remain pending separately.

`supabase/proposals/20261012_stage3_branding.sql` is outside deployable migrations.
No proposal was applied to production or a live Supabase project, no real bucket was
created, no administrator was granted, and no deployment or merge was performed.
Orphan/reserved uploads are retained after ambiguous finalization failures; cleanup
needs reviewed reconciliation rather than deletion that could destroy committed evidence.
High-volume queue pagination and broader platform-admin lifecycle tooling remain Stage 4/7.

## Validation

The final local validation uses Node 22.23.3 with non-production build placeholders.
All checks completed successfully:

| Check | Result |
| --- | --- |
| Unit tests | 20 passed |
| Isolated PostgreSQL tests | 53 passed |
| Chromium browser-contract tests | 18 passed |
| Total automated tests | **91 passed, 0 failed, 0 skipped** |
| Next.js type generation and TypeScript | Passed |
| ESLint | 0 errors, 7 existing warnings |
| Default Turbopack production build | Passed |

Coverage added in Stage 3: 3 image-validation unit tests, 19 database tests and 5
browser journeys. Browser journeys cover independent MFA approval, member restriction,
valid/invalid uploads, sanitized missing-object responses and retention after ambiguous
finalization. Existing Stage 1/2 invitation, recovery, account switching, status,
revocation and QR tests also pass. Read-only Stage 3 inspection SQL executes against
the isolated PostgreSQL fixture without changing its branding state.

Database tests use real disposable PostgreSQL with no published ports/network and a
metadata-based baseline plus explicit substitute legacy/Auth/Storage definitions.
Browser tests run real Chromium/Next.js against a loopback Auth/REST/Storage fixture;
MFA exchange is mocked. Actual Supabase Auth/Storage/MFA/SMTP are **not verified**.
The suite includes all Stage 1 and Stage 2 regression tests. Nothing is skipped or
silenced to obtain a passing result. Stage 8 stays postponed; no OCR/AI dependencies,
AI tokens, paid verification API, payment charge or paid service is introduced.
