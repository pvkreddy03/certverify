# Stage 3 live integration and release gates

All SQL in `supabase/proposals` is an **unapplied proposal**. No bucket, platform administrator,
production record, setting or policy was changed. Apply only to a disposable Supabase project
first, after inspecting actual functions and ownership as described in
[Stage 1 integration](stage-1-supabase-integration.md). A PostgreSQL fixture cannot certify
Supabase Auth, MFA, Storage API metadata, email delivery or the actual production schema.

## Required isolated-project preparation

1. Inspect actual schema using `supabase/inspection/stage1-readonly.sql` and
   `supabase/inspection/stage3-readonly.sql` in a read-only transaction. Save reports privately.
   Review SECURITY DEFINER functions, function/table/column grants, view access, triggers,
   account/template ownership and all Storage policies. No legacy function may bypass
   the protected name, branding pointer, immutable versions, pending proposals or storage
   authorization. Explicitly assess `service_role` and inherited-role privileges.
2. Apply reviewed Stage 1, Stage 2 and Stage 3 proposals in order to that isolated project.
   Check real signup/account triggers, valid baseline company names (2–160 characters),
   individually owned accounts and template/certificate ownership. Conflicting branding
   bucket configuration fails the transaction instead of being silently overwritten.
3. The proposed bucket is **private**, allows only `image/webp` and has a 2 MiB object
   limit. Test the actual Storage API returns `metadata.mimetype = image/webp` and
   `metadata.size` compatible with finalization. Server re-encodes static PNG/JPEG/WebP,
   strips metadata, caps dimensions/input pixels and never accepts SVG or client URLs.
   Source images stay in memory; only one canonical normalized file is stored per asset.
4. Confirm the server-only Supabase service key is securely configured in the isolated
   environment and Vercel server settings. Never use it in browser bundles, logs or chat.
   Uploads reserve a random tenant-specific path through the user-scoped RPC, then the
   trusted server stores bytes with `upsert:false` and finalizes metadata. Finalization
   rechecks active owner/admin membership under the account lock. Ten upload reservations
   per account per rolling 24 hours limit abandoned uploads; a failed attempt counts.
5. Seed an explicitly approved platform administrator via a separately reviewed privileged
   operation in the isolated project. There is intentionally no self-promotion, default
   administrator, organization-owner inheritance or customer-accessible grant API. For
   production, administrator identity and privileged bootstrap require owner approval.
   Verify confirmed email and enroll TOTP MFA. Layout access requires verified platform
   identity; review APIs/RPCs and platform logo access additionally require Supabase-signed
   `aal2`. Test unenrolled, aal1, invalid code, aal2, expired session and revoked privilege.

## Historical certificates: mandatory reconciliation before rollout

Current account names are baseline versions, **not evidence of historical issuer identity**.
Stage 3 automatically freezes the branding version for certificates issued after installation.
It does not update historical or revoked certificate rows and does not guess their old branding.

Prepare a reviewed mapping for every previously issued certificate. Establish company name,
public professional details and the actual logo version from reliable historical records.
If issuer identity changed over time, create separate retained historical versions with explicit
reviewed provenance and validated immutable logo assets. Insert associations into
`cv_certificate_branding` with `provenance='reviewed_historical'` through a separate reviewed
privileged reconciliation proposal. The association validates the certificate's account and
version's account, and is immutable thereafter. Include approver, evidence and mapping
identifiers in an append-only audit event; preserve the source evidence privately.
Do not disable certificate guards, edit revoked rows or map all old certificates to today's name.

**Do not release until historical mapping is complete and verified.** Unmapped certificates
remain identifiable with their real status/fields, but show “Issuer information unavailable”
instead of a potentially false identity. This is a deliberate visible release gate. Compare
before/after public pages and QR links for representative Active, Inactive and Revoked legacy
records. Resolve missing historical evidence with the owner before any production rollout.

## End-to-end matrix in real Supabase

- Individual owner and organization owner/admin: current profile, validated private logo
  upload, request, duplicate prevention, exact proposal preview and unchanged live identity.
- Ordinary member, removed member, unrelated organization and anonymous client: reject
  raw writes, direct storage mutations, pending-logo reads, forged account/asset IDs and
  unapproved identity changes. Approved public certificate logos are intentionally public;
  pending/unreferenced uploads remain private. Broader preexisting Storage policies must
  not bypass restrictive branding policies.
- Separate platform administrator: approve, reject with reason, request information and
  view both organization/platform audit evidence. Reject own request review. Customer
  owner and platform aal1 cannot perform any approval or retrieve protected platform logos.
- Scoped grant: exact request/account/user/changed fields; deadline <=7 days; preview,
  one-time apply, replay, wrong recipient/account, expiry, revocation and access removal.
  The UI grants 24 hours. It applies only approved values; it is not a general edit window.
- Concurrency: parallel approvals, permission use vs revocation/member removal, upload
  finalization vs member removal, and issuance vs approval. Confirm one version/audit and
  the issuance-time version. Test real API timeouts, upload failure and finalization loss.
- Templates/current dashboard use current approved branding. Old public certificates and
  certificate details keep their issuance-time name/details/logo across later changes,
  including logo removal. Current status still follows Stage 2 without cached validity.
- Download private logo requires fresh verified user authorization. Private responses use
  `no-store`; public logo responses cache at most five minutes and immutable paths.
  Confirm HTTP MIME, `nosniff`, canonical paths and no signed storage URL leakage.
- Invitation delivery, new-user password setup, existing-user acceptance and recovery
  still require the real-email checks prepared in the Stage 1 integration document.

## Operations and limitations

An ambiguous finalization response retains the upload: deleting it could destroy a committed
asset. Reserved/orphan objects need a reviewed reconciliation and cleanup plan; there is no
automatic deletion or lifecycle job. Never delete ready/referenced historical assets. File
retention and any production cleanup remain policy decisions requiring approval.

Public pages link “Powered by CertVerify” to the application homepage, the current official
site; validate the intended canonical launch domain in deployment settings. No customer
branding can replace this attribution. No PDF/OCR/AI processing or paid provider is added.

Approval queue/history is a minimal Stage 3 foundation, not the complete Stage 4 dashboard.
High-volume queue pagination/abuse controls and platform-admin lifecycle UI remain Stage 4/7.
No production migrations, bucket configuration, administrator seed, deployment or merges
are authorized by the Stage 3 implementation alone.
