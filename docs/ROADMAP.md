# CertVerify commercial launch roadmap

The owner's master instructions govern implementation. Preserve existing functionality,
work through isolated branches and reviewable PRs, and test each stage. Production
merges, deployments, database changes and destructive operations require explicit
approval. Real charges and paid AI processing also require explicit approval.
Credentials belong in secure environment settings, never chat or source control.

## Launch scope: stages 1–7

1. **Authentication and organization security:** signup/verification/login/recovery;
   new-user name/password invitation setup; existing-user acceptance; expiring,
   one-time invitations with resend/cancel and race/partial-failure handling;
   individual-to-organization upgrades; multiple memberships and explicit account
   switching; owner/admin/member authorization; immediate access removal preserving
   historical records; server authorization, RLS and sensitive-action audit logging.
2. **Certificates and QR verification:** customizable typed required/optional and
   public/private fields; account templates; collision-free IDs; PNG/JPEG QR downloads;
   search/activity tracking; Active/Inactive/Revoked transitions; mandatory revocation
   reason, actor, timestamp and audit; no ordinary reactivation; linked replacements.
   Public verification exposes only approved fields and current status/revocation
   explanation. QR verification queries Supabase and uses no AI APIs or AI tokens.
3. **Branding:** centralized validated logo storage, protected account identity,
   request/review/approve/reject/request-information workflow, scoped expiring change
   permissions, immutable history, and issuer branding snapshots at certificate issue.
   Public pages always include immutable platform attribution and official-site link.
4. **Platform administration:** separate server-authorized Super Admin permissions
   with audit records. Customer ownership never grants platform privileges. Account,
   subscriber, certificate and payment reporting; search/filter/export; customer
   suspension/restoration; administrator grants; branding approvals; pricing controls.
5. **Pricing and entitlements:** editable plans, eligibility, currency/billing period,
   users/additional seats, quota/unlimited option, trials, renewal price, visibility,
   dates/features/restrictions. Coupons, percentage/fixed discounts, introductory
   cycles, targeting, dates, redemption limits and conversion reporting. Preserve
   subscription/invoice price snapshots; server-only calculations and concurrency-safe
   quotas count certificate creation, never scans; revocation/deletion never refunds
   usage. Owner's example INR prices are examples, not hardcoded product rules.
6. **Payments and lifecycle:** provider adapters for Razorpay/PhonePe or replacements,
   verified checkout and webhook signatures, idempotency, upgrades/downgrades/seats,
   trials/promotions/renewals/reminders/grace periods/cancellation/non-renewal,
   invoices and payment history. Expired entitlements block paid operations at the
   server while allowing billing/reactivation; issued certificates remain publicly
   verifiable subject to an approved retention policy. No live charges without approval.
7. **Production readiness:** comprehensive integration/browser/security tests,
   performance and storage optimization, observability, abuse protection, backup and
   restore validation, deployment documentation and independently reviewed release.

## Stage 8 is deferred until further notice

Do not implement PDF/OCR comparison, AI mismatch detection, paid AI APIs or document
upload processing for the initial launch. Keep certificate data and public verification
interfaces modular enough for a later approved adapter; no OCR dependencies or AI
credentials should be introduced now.

## Release decisions still requiring owner approval

Actual published plan/offer terms, retention policy, payment provider activation,
real charges, platform administrator bootstrapping and production operations.
Routine implementation and isolated testing do not require owner coding work.
