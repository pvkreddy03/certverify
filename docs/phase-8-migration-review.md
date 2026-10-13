# Phase 8 fresh staging migration and privileged bootstrap review

This review continues draft PR #11. It does not restart Stages 1–7, apply hosted SQL, or establish production compatibility. The protected source is `jhnxztaqfikgvkshifel`; the only approved staging target is `nubohxesjeaodqcveiud` (`certverify-staging`, `ap-south-1`, PostgreSQL 17).

## Execution order and install behavior

The connected Supabase operator must receive explicit owner approval for hosted schema installation and independently confirm the management tool's `project_id` before executing any SQL. A comment, environment variable, or bootstrap SQL setting is not evidence of database identity.

Execute the following eight complete files, each as its own transaction, in this exact order:

| Order | Repository path | Dependency and purpose |
| --- | --- | --- |
| 1 | `supabase/staging/20261012_fresh_baseline.sql` | Fresh application schema, genuine Auth signup trigger, profiles/personal accounts, private counter and safe baseline policies. Requires existing managed Auth/Storage schemas and zero Auth users. |
| 2 | `supabase/proposals/20261012_stage1_account_security.sql` | Selected-account context, memberships/invitations, transactional administration, restrictive tenant RLS. |
| 3 | `supabase/proposals/20261012_stage2_certificate_revocation.sql` | Certificate state transitions, revocation evidence and narrow public verification projection. |
| 4 | `supabase/proposals/20261012_stage3_branding.sql` | Immutable issuer versions, approval/scoped permission workflow, platform MFA foundation and private logo bucket/policies. |
| 5 | `supabase/proposals/20261012_stage4_platform_admin.sql` | Platform reports, account access state, suspension locks and administrative audit guards. |
| 6 | `supabase/proposals/20261012_stage5_billing.sql` | Versioned editable catalog, immutable quotes/periods, transactional seats/certificate quotas and renewal restrictions. |
| 7 | `supabase/proposals/20261012_stage6_payments.sql` | Gateway order/event records, signature-verified service entrypoints and immutable settlement evidence. |
| 8 | `supabase/proposals/20261012_stage7_readiness.sql` | Replay/budget safeguards, reconciliation, captured future-period protection and Auth-state revocation checks for existing tokens. |

These are one-time installers, not generally idempotent migrations. `IF NOT EXISTS` on selected columns does not make an entire file safe to replay. Stop at the first failure, inspect the rollback and migration ledger, and retry only the failed file after confirming its transaction did not commit. Do not rerun successful installers. Generate the final path/SHA-256 manifest with the repository's print-only `hosting:migrations` command at the final reviewed commit; record eight distinct ledger entries using full filenames, not their shared date prefix.

## Management tool preflight: read only

Run project metadata lookup through the connected management tool, then execute this read-only query specifically against `nubohxesjeaodqcveiud`. It exposes counts/schema names, not account credentials or private user data:

```sql
begin transaction read only;
select current_user as installer_role, version() as database_version,
       current_setting('transaction_read_only') as readonly_transaction;
select count(*) as auth_user_count from auth.users;
select c.relname, c.relkind, pg_get_userbyid(c.relowner) as relation_owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m')
order by c.relname;
select to_regclass('public.accounts') as accounts,
       to_regclass('public.certificates') as certificates,
       to_regclass('auth.users') as managed_auth_users,
       to_regprocedure('auth.uid()') as managed_auth_uid,
       to_regclass('storage.objects') as managed_storage_objects;
select rolname, rolbypassrls from pg_roles
where rolname in ('anon','authenticated','service_role','supabase_auth_admin','supabase_storage_admin');
rollback;
```

The baseline rejects existing `accounts`/`certificates`, missing managed prerequisites, and nonempty Auth users before application installation. An earlier empty-project report is not a current verification: no genuine hosted preflight was executed by this review. Unexpected application tables/users require reconciliation; do not delete them to make the baseline pass.

## Verified local properties and remaining hosted checks

The actual eight installers are exercised by the fresh disposable PostgreSQL harness. This is real PostgreSQL 17 execution with synthetic substitutes for provider-managed Auth/Storage, not real Supabase integration.

Code/SQL inspection and existing local tests support these properties:

- Signup metadata can initialize a display name but cannot assign platform privileges or paid entitlements. Signup creates one individual account; organization upgrade and invitations retain account-specific membership context.
- Auth user foreign keys restrict deletion of historical issuance/membership evidence. Existing production ownership and issuer identity are not inferred or backfilled by the fresh installer.
- Selected-account restrictive RLS combines with permissive baselines to deny cross-tenant access and membership removal bypasses. Checked RPCs serialize account administration and issuance.
- Reviewed SECURITY DEFINER functions set an empty `search_path` and use qualified objects. Anonymous execution is limited to the catalog, public certificate projection and public logo lookup.
- Service role bypasses RLS but has no raw access to numbering and financial tables; narrow server RPC grants are deliberate. Hosted effective privileges still require inspection of role inheritance, ownership and global/schema default ACLs.
- Certificate counters and quota consumption serialize concurrent requests; consumed quota cannot decrease when certificates are revoked. Versioned branding and financial records preserve issued identity and accepted prices.
- Platform RPCs require an independently assigned active platform identity and an `aal2` claim. Organization ownership never implies platform access.
- The `certverify-branding` bucket is private, limited to WebP and 2 MiB; uploads are sanitized by the application. Authenticated clients cannot directly insert/update/delete its objects.

The connected operator must verify these provider-managed integration details after approved installation:

1. The selected SQL installer role can create the application Auth trigger and Storage policies without changing ownership of managed Auth/Storage relations. Inspect real role memberships/default ACLs; local superuser fixtures do not prove hosted privileges.
2. Real signup, confirmed-email redirects and `inviteUserByEmail` run the signup trigger without conflicting managed triggers. Confirm profile, individual membership, branding and account-access rows exist exactly once.
3. Actual PostgREST request headers and JWT claims populate selected-account context, `auth.uid()`, service role and `aal2` as expected. Test authenticated tokens, removed memberships and direct RPC/table requests with separate tenants.
4. Actual TOTP factor rows use `factor_type='totp'` and `status='verified'`; privileged RPCs remain denied before challenge/verification and with AAL1 tokens.
5. Storage upload metadata supplies `mimetype='image/webp'` and the byte size expected by `cv_finalize_logo`. Verify application sanitization, private reads, denied cross-tenant object access and immutable historical logo versions using the real Storage API.
6. Run `supabase/inspection/hosted-security-readonly.sql` and the provider security advisor. Review raw function definitions privately; do not copy potential sensitive literals into public logs/issues. Resolve unexpected anonymous definer/table/column grants rather than accepting advisor warnings without review.
7. Confirm actual hosted concurrency, webhook replay and financial reconciliation after credentials are verified. Local mocks do not establish Razorpay sandbox correctness.

## Confirmed review findings

The original `supabase/operations/sandbox-owner-bootstrap.sql` is a **psql template**, containing `\set` and psql variable interpolation. It cannot be passed verbatim to a Supabase management SQL endpoint. The additional plain-SQL operator template below resolves this tooling incompatibility while retaining privilege approval and MFA requirements.

A focused disposable-database adversarial probe also confirmed that the original Stage 3 `cv_platform_identity()` checked only an active platform row and confirmed email: a synthetic admin with a future `auth.users.banned_until` still passed `cv_is_platform_admin()` under an existing AAL2 claim. This demonstrated the SQL check's limitation, not live token behavior.

Installer 8 now adds `cv_auth_identity_active()` and uses it at central platform, tenant, billing, discovery and invitation acceptance boundaries; a restrictive profile policy closes the independent direct profile read path. Banned, deleted, anonymous or unconfirmed Auth identities are denied even when an existing JWT supplies AAL1/AAL2 claims. The helper uses qualified objects and an empty definer search path; only authenticated users can call its self-validity predicate. Existing function ACLs are preserved. Active confirmed users still see suspended account billing/history and can switch away, while anonymous public QR verification/catalog remain available.

Seven additional focused PostgreSQL regression tests passed for these checks, including stale platform/member claims, restored identities, cross-tenant denial, unconsumed invitations, suspended-organization billing and continued public verification. This fix is prepared and tested locally, not applied to staging or the protected source. Privilege assignments must also be revoked during administrative incident response; do not rely exclusively on JWT expiry.

## First-owner Super Admin: separate approval, not installer 9

`supabase/operations/sandbox-owner-bootstrap-management.sql` is valid plain SQL for connected management tools. It is intentionally separate from the eight migration installers and is **not** a public RPC. The existing psql template remains available for privileged CLI operators; neither template is automatically applied.

The connected operator must:

1. Confirm the owner-controlled, already registered staging Auth user and its immutable UUID through secure authorized management access. Do not hardcode founder identity in source.
2. Have the owner enroll and verify a genuine TOTP factor through the website. This interactive possession proof cannot be simulated by an engineer.
3. Obtain explicit owner approval to grant that identified account staging platform privileges and record a meaningful approval reference.
4. Independently confirm tool project identity, then safely substitute the two non-secret operator input placeholders in the management template; do not perform global replacements that alter validation checks. Execute the complete transaction only against `nubohxesjeaodqcveiud`.
5. Confirm exactly one platform administrator row and one immutable `platform.sandbox_owner_bootstrapped` audit. Verify platform RPC denial for ordinary/organization-admin users, AAL1 sessions and removed platform permissions.

The template fails with untouched placeholders or another project reference. It checks confirmed, unbanned, undeleted, nonanonymous Auth identity and a verified TOTP factor, serializes first-admin bootstrap, and commits grant plus audit atomically. Recording the staging reference in SQL does not independently prove remote project identity; the management tool selection remains mandatory.

Seven focused local PostgreSQL tests passed for the management template: untouched placeholders, protected/unapproved project input, missing email/TOTP verification, banned/deleted/anonymous identity, authenticated AAL2 self-assignment, audit failure rollback, and concurrent first-admin grants with immutable evidence. Real MFA and hosted privilege assignment remain unexecuted.

## Rollback, source reconciliation and safe handoff

Keep the existing application disabled for database writes until all eight installers and provider security checks succeed. Before approving application access, record migration hashes, function/ACL inventory and a restore point using existing staging backup capabilities without purchasing services.

If a transaction fails, roll it back and review that failed installer. After committed installations contain synthetic testing data, destructive rollback/recreation requires a separately approved staging operation. Never copy rollback instructions onto the protected source project. Redeploying application code alone does not undo a schema change or a financial record; preserve immutable ledger history and reconcile partial external operations.

These fresh installers are not safe instructions for the protected original database. Existing-schema reconciliation requires read-only inspection of actual historical SQL functions, triggers, grants and account/template/certificate ownership, reviewed backfills, preservation of issuer evidence, subscription entitlement reconciliation and a separate production release approval. No production migration/deployment is authorized by this review.

The owner is not expected to run commands, paste SQL or inspect logs. Connected Supabase/Vercel operators execute this package after the specific unavoidable owner approvals; engineers perform deployment verification and service integration checks. The founder's interactive work is limited to approving hosted schema/privilege actions when requested, verifying ownership/MFA, and customer-style acceptance testing.
