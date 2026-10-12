# Stage 7 — Integration, security and readiness

Base: Stage 6 PR #9 at `54ef3a2b9e8ba8da354ff61f269d5dd49c10e008`.
All Stage 1–6 implementations are included by ancestry; previous drafts remain unchanged.
Stage 7 SQL remains an unapplied proposal.

## Concrete integration and security work

- Patched Next.js and matching ESLint configuration from 16.3.2 to 16.3.8, with compatible
  locked transitive updates. Registry audit: zero production-dependency vulnerabilities;
  five high development findings remain through `braces` → `micromatch` → `fast-glob`
  → Next ESLint. `braces@3.0.4` was unavailable. Do not downgrade Next/ESLint to the
  suggested old major merely to silence the audit. Untrusted glob inputs must not enter
  these development tools. Recheck advisories before release; this is not a clean full audit.
- Added persisted, signature-gated webhook replay checks before provider API fetching.
  Replays with a changed unsigned event-ID header are recognized by raw-body digest and
  payment identity; conflicting IDs reject. Transactional processing also deduplicates
  matching fingerprints. Concurrent settlement remains serialized and idempotent.
- Added central, keyed-hash request budgets for payment checkout, verification, financial
  administration and valid webhook processing, plus actor-wide database quote limits.
  Customer direct RPC calls cannot bypass quote limits. Budget tables deny direct
  service-role access; cleanup removes only old rate counters, never financial evidence.
- Test payments reject Vercel production and require explicit isolated-sandbox target
  plus a matching configured Supabase project reference. Missing safeguards fail closed.
  No production/live gateway configuration is enabled.
- Added bounded sandbox reconciliation jobs: fetch authoritative order payment lists,
  reject cross-order references, reconcile verified payment state, and persist check
  times. Captured attempts are checked every six hours, other pending/review attempts
  every five minutes when a scheduler invokes the job. At most 20 attempts per batch;
  automatic scans cover recent captures (90 days) and unresolved attempts. Older
  captures rely on signed refund/dispute webhooks or manual reconciliation. Uncertain
  order/refund POSTs are never recreated by this job.
- Logo authorization/daily reservation now happens before CPU-intensive image decoding.
  Invalid uploads consume a bounded reservation, preventing repeated decoding before
  authorization. Static PNG/JPEG/WebP validation and immutable storage remain intact.
- Added anti-framing, MIME-sniffing, base/object restrictions, privacy headers and
  non-cacheable authentication/internal errors. The CSP deliberately does not claim
  complete script restriction: Next.js and Razorpay script/iframe compatibility still
  need a nonce-based policy review in staging.
- Fixed a confirmed financial cancellation bug: owner cancellation could discard a
  captured future period without refund. Paid requests now require reviewed refund
  handling; renewal cancellation honors already-paid periods and keeps non-renewing
  preference when those periods start. A regression failed before the fix.
- Gateway interface capability types allow future providers to declare differing
  support. Razorpay retains its tested capability values; only that adapter is enabled.
- Manual order binding and reconciliation now record the initiating MFA administrator
  separately from the original payer, so financial recovery has a responsible actor.
- Added print-only ordered migration hashes and expanded private read-only inspection.
  Reused one disposable billing harness for Stage 6/7 tests rather than duplicated setup.

## Scenario evidence and limits

| Scenario | Executed local integration | Still incomplete externally |
| --- | --- | --- |
| A: Individual | Seeded verified user/account; local HTTP order/capture; real SQL pricing/settlement; template, public/private certificate values, quota, PNG/JPEG QR and public SQL verification | Genuine signup/email confirmation, actual account-creation triggers, actual browser checkout and merchant sandbox |
| B: Organization | Real SQL invitation of existing user, owner promotion to admin, admin invitation/member acceptance, issuance, audited member removal and denied subsequent access | Genuine signup, new-user password setup, delivered invitation emails and real sessions |
| C: Lifecycle | Real trial/paid/renewal SQL boundaries, local HTTP authoritative capture, concurrent quota, expiry restriction and continued public verification | Real merchant capture settings, scheduled jobs, verified historical subscriptions and billing policies |
| D: Security | Real cross-tenant/role/grant denial, invalid HMAC, concurrent quota/capture, replay identity, budgets and immutable financial evidence | Production grants/legacy function bodies, real signed JWT/MFA, hosted rate/abuse controls, independent penetration test |
| E: Branding/revocation | Real approval, immutable old issuer, new issuer, reasoned revocation and replacement linkage | Genuine Storage delivery/policies, historical backfill evidence and real MFA approval |

These scenarios use disposable PostgreSQL executing all seven proposals, a local HTTP
Razorpay protocol fixture and application payment adapter/reconciliation modules. They
are not wholly mocked browser responses. Browser tests separately exercise the real
Next.js UI against mocked Supabase/Auth/MFA. None of these establishes hosted Supabase
or production-schema compatibility. Fixture auth helpers and legacy numbering bodies
are explicit substitutes, not verified production implementations.

Passed locally: 38 unit, 134 PostgreSQL and 38 browser tests (210 total; zero failures
or skips), TypeScript, lint (seven existing warnings, zero errors) and Next 16.3.8
production build. GitHub CI and final commit are recorded in the draft PR.
Existing lint warnings are retained; no meaningful test is disabled or weakened.
Browser assertions allow 15 seconds for asynchronous cold Next.js page/API compilation;
trace evidence showed requests still pending at the five-second default. Retries remain
disabled. Local HTTP fixtures close connections to avoid stale idle sockets while the
synchronous Docker SQL driver blocks the fixture event loop; financial POSTs are not retried.

## Operational commands

- `npm run migration:manifest`: prints ordered proposal paths and SHA-256 hashes only.
- `npm run inspect:db -- --stage=7`: verified-TLS read-only inspection using secure URL;
  private reports are ignored. No live binding was available during this work.
- `npm run payments:reconcile -- --sandbox`: requires explicit isolated test configuration,
  performs provider GET reconciliation and bounded non-financial counter cleanup.
  It never creates an order/refund or initiates a charge. No scheduler was enabled.

See `release-runbook.md` for exact configuration, migration, integration, rollout,
rollback and launch blockers. Stage 8 remains postponed. No paid API, production SQL,
merge, production deployment or real payment was performed.
