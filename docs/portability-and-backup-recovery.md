# CertVerify portability and recovery checkpoint — 15 October 2026

**Scope:** isolated staging Supabase project `nubohxesjeaodqcveiud` and Preview branch `fix/phase8-email-feedback-mobile-navigation`. This is **not** an authorization to touch protected production Supabase data or release to production. Payment provider integration is frozen until UI and core platform review.

## Current architecture and replacement seams

| Concern | Neutral boundary | Current implementation | Still coupled / future work |
|---|---|---|---|
| Public certificate lookups | `PublicVerificationRepository` (`lib/providers/public-verification.ts`) | `SupabasePublicVerificationRepository` implements `findByReference` and `findLogoPath` via security-reviewed database RPCs | Private dashboard workflows still use Supabase client/RLS directly; migration requires a fully equivalent tenant authorization layer |
| Logo blobs | `LogoObjectStorage` (`lib/providers/logo-storage.ts`) | Private Supabase Storage with immutable WebP uploads, tenant-scoped RLS, per-account asset records | An S3/R2/other implementation must preserve reservation, object visibility, MIME/size limits, same ownership, and approved public reads |
| QR verification hostname | `publicVerificationUrl` | `NEXT_PUBLIC_VERIFICATION_ORIGIN` if configured, else canonical `NEXT_PUBLIC_APP_URL`; preview origin pinned to `https://certverify-staging.vercel.app` | Purchase/verify a **permanent production hostname** before printing customer QR codes. Changing configuration does **not** rewrite already-printed QR URLs; retain HTTP redirects from all old official hosts |
| Organization and Auth | Tenant-scoped membership and role RPCs, Supabase Auth | Postgres, RLS, `auth.users`, Supabase session/JWT and email OTP | NOT provider-agnostic; replacing Auth must reproduce unique email identity, invitation proof, password resets, MFA and revoke semantics |
| Billing | common `lib/billing` model and payment service | Razorpay test-mode adapter, provider-specific checkout and webhooks | No payment-provider change during this phase; handle separately after UI approval |

Changing the database or payment gateway is **not** yet a one-setting migration. Unimplemented providers are rejected rather than silently falling back to the wrong database. A migration must preserve certificate/reference IDs, account/user code mapping, role-based permissions, immutable audit trails and revocations.

## Issuer branding: shared current logo with immutable history

- A successful logo upload creates **one** stored WebP object under an account-scoped immutable path and a `cv_logo_assets` record.
- A certificate stores a reference to an approved branding version, never inline logo image bytes. Ten thousand certificates using one version consume **one image object**, not ten thousand.
- Staging proposal `20261015_current_shared_logo_presentation.sql` changes only the **publicly displayed logo** to the organization's currently approved logo for every certificate. Original issued name, professional details and immutable branding/certificate snapshots remain unchanged for audit, not retroactively rewritten.
- A new approved logo becomes visible to older certificates without editing each certificate; approving a version with no logo removes the logo from public presentation. Only **ready**, approved images may be fetched anonymously.
- Supabase Storage RLS remains private. An active public certificate must belong to the organization for the current approved image to be readable.
- The change intentionally affects public presentation on already-issued staging certificates. Review the legal implications of changing issued document branding before production rollout; an optional future policy toggle may distinguish current-vs-issued branding.

## Data recovery: minimum mandatory process before customer launch

1. Verify the actual staging/project/branch identifier and stop application issuance writes for a consistent snapshot. Do not use an old backup or a Vercel build as proof of a restorable backup.
2. Obtain **encrypted, access-controlled backups** of:
   - PostgreSQL schema and all application rows, including `auth.users` and Auth identities, account memberships, certificate data/fields, branding versions/assets, billing history, usage, gateway events, audit entries and invitation state.
   - Every private branding object and its original object path, MIME type and SHA-256. Database-only export cannot restore logo bytes.
   - Supabase Auth redirects, email templates, approved redirect URLs, SMTP settings, RLS/grants, Storage bucket policies/limits and custom database functions/triggers.
   - Applicable hosting domain/DNS configuration and webhook destinations (configuration inventory only, **never** plaintext secrets).
3. Keep backup encryption keys outside the backup itself. Verify destination durability, retention, restricted access, rotation and an independently tested restore. Do not attach raw customer data or Auth hashes to PRs, issue trackers, chats, or CI public artifacts.
4. Run `supabase/inspection/portability-readiness-readonly.sql` before and after the restore. All error counts must be zero; reconcile record counts, asset paths, account identifiers, public certificate references, role mappings and revoked certificates.
5. Restore into a **new disposable isolated project** first. Recreate private buckets, policies and functions; copy blobs without public ACLs; verify cross-tenant isolation, MFA and account-admin grants.
6. Run a public verification smoke test on a legacy certificate and a revoked certificate; exercise password reset, active organization membership, certificate uniqueness, logo preview and logo approval with real Auth and Storage. Payment records are checked read-only and any gateway idempotency/receipt mapping must be reconciled before a future payment enablement.
7. Choose a cutover time and migration strategy after verifying restore results and retention. Keep the original official verification domain redirected to the new host; printed QR codes are permanent references, not links that magically update.

**Current limitation:** There is no verified durable, off-project export of Auth + database + private image blobs, and no confirmed full restore into an independent project. The read-only integrity audit is useful evidence but **not a backup**. Connected management access alone does not establish a secure backup destination or permission to copy private user records. This remains a launch blocker.

## Verified staging integrity

On 15 October 2026 the read-only inspection reported **zero**:
- Duplicate public verification identifiers
- Branding-version/account ownership mismatches
- Current-branding/account ownership mismatches
- Missing Storage objects for ready, approved logos
- Orphaned certificate-field rows
- Orphaned billing-period usage rows

Five earlier Pooja Stores certificates originally issued without an image now resolve to its current approved logo through their existing public identifiers; no certificate rows or audit snapshots were rewritten.

## Tests and release gate

Run `npm run lint`, `npm test`, `npm run test:db`, `npm run test:browser`, `npm run typecheck`, and `npm run build`. The CI workflow covers these. Latest exact CI commit and result must be checked before any release.

Do not change production database, merge PR, enable live payments, buy a domain or send production invitations without separate explicit approval. Staging users can test the current UI at `https://certverify-staging.vercel.app/login`. This is NOT the permanent customer QR hostname.
