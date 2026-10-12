# Stage 4 Supabase integration and release gates

Stage 4 SQL is an **unapplied proposal**, outside deployable migrations. No production
account, membership, access state, administrator, subscription, bucket or setting was
changed. Local tests do not certify the deployed Supabase schema or authentication service.

## Isolated project preparation

1. Use `npm run inspect:db -- --stage=1`, `--stage=3`, and `--stage=4` with
   `CERTVERIFY_READONLY_DATABASE_URL` supplied only through secure environment settings.
   The runner enforces trusted TLS verification and saves private ignored reports.
   Run the Stage 1, Stage 3 and `supabase/inspection/stage4-readonly.sql` inspections
   through secure read-only access. Save actual function bodies and grants privately;
   do not commit raw reports or send credentials in chat. Review existing account-status
   mechanisms, subscription/billing tables, triggers, SECURITY DEFINER entrypoints,
   inherited roles, table/column grants, public views and Storage policies.
2. Apply reviewed proposals in order (Stages 1, 2, 3, 4) **only to a disposable project**.
   Complete the existing historical template ownership and certificate-branding
   reconciliation gates. Do not apply Stage 4 without those dependency reviews.
3. The new `cv_account_access` baseline is active for existing accounts, reflecting
   the inspected historical schema with no lifecycle column. **Before any rollout,
   reconcile actual existing suspensions/deactivations and preserve them.** If actual
   live status mechanisms exist, prepare a reviewed mapping instead of blindly using
   this baseline. Verify new account/signup triggers create exactly one access state
   and that confirmed signup and individual-to-organization upgrades still work.
4. Explicitly approve and seed the platform administrator through a privileged reviewed
   operation. There is no default administrator, self-promotion API or customer-admin
   inheritance. This stage does not expose a general administrator-grant interface.
   Require confirmed email and real TOTP MFA. All report APIs/RPCs require `aal2`,
   including account/membership reads, not just suspension or branding decisions.
5. Map any reliable existing subscription data to informational summaries through a
   separate reviewed trusted import. The proposal seeds **no** subscription records;
   missing data is `unknown`, not free, active, expired or a paid subscriber. Summaries
   carry source and observation time. They neither set prices nor authorize paid usage.
   Stage 5 will own plans/subscription records and Stage 6 payment/entitlement enforcement.

## Required real integration checks

- Dedicated `/platform-login` uses existing Supabase Auth credentials. Verify secure
  cookies, recovery, login redirects, TOTP enrollment/challenge, invalid code,
  expired/revoked sessions, `aal1` rejection, `aal2` success, unconfirmed email and
  revoked platform privileges. Test genuine signed JWTs; fixture tokens are not proof
  of production signature/session validation. Organization role/user metadata cannot
  grant platform access. There is no new admin password store or service-key browser use.
- All reports use explicit metadata projections in user-scoped checked RPCs. Confirm
  private certificate fields, internal revocation reasons, password hashes and raw
  auth metadata cannot appear in overview/account reports, search or activity.
  Account membership email is restricted to authorized MFA platform inspection.
  Platform role alone must not grant raw cross-tenant table reads or customer mutations.
- Test search by approved name/code/account reference/owner email; literal percent and
  quote inputs; each type/access/subscription filter; stable pagination; missing IDs;
  invalid page/limit; and membership pages containing active and removed records.
  Accounts/branding pages cap at 50 via SQL (UI pages 25); membership/audit pages cap at 50.
  Account activity returns latest 50 event headers, not their confidential details.
- Suspend/deactivate with reason and expected revision. New reads and mutations must
  fail in RLS/RPC/trigger checks, including issuance, certificate fields/templates,
  invitation preparation/acceptance, member administration, account upgrades, branding
  requests/permission use and private logos/finalization. Test direct REST operations,
  old sessions, forged account headers and legacy helper/definer bypass attempts.
- Restoration requires a reason and preserves memberships, certificates, revocations,
  branding versions and audit history. Suspended accounts remain discoverable to their
  active members as routing metadata so users can select another active organization.
  No removal, history deletion, automatic certificate revocation or billing charge occurs.
- Race suspension against issuance, field/template changes, invitation acceptance,
  member removal, logo finalization and temporary branding permission use. Account
  locks serialize those actions; test transaction retries and actual trigger ordering.
  A mutation already committed before suspension may remain; after suspension commits,
  subsequent operations must be blocked. Suspension cannot erase a response already
  received by a customer; it is enforced on subsequent server/database operations.
- Parallel state decisions with the same revision: one commits, the other rejects as
  stale. Refresh before retrying; a timed-out response must not blindly repeat another
  transition. Valid same-state requests do not create duplicate transition audits.
- Previously issued Active/Inactive/Revoked certificates remain publicly verifiable,
  with frozen issuer logos/name and their real status. Private logo access is disabled
  for suspended customers; public frozen-logo access remains available through safe RPCs.
- Reuse branding approval/rejection/information workflows. Recipient dropdown only lists
  active account members. Test scoped expiry/revocation and suspended-customer use. A
  platform admin may review branding while a customer account is suspended; this does
  not restore customer access or change historical certificates. Queue reads are now
  paginated/status-filtered; the old unbounded queue RPC is no longer client-executable.
- Confirm account-status changes have both organization and immutable platform audit
  evidence: reason, actor, time, old/new state and revision. Successful platform report
  reads are also audited. Direct customer append/update/delete is denied; update/delete
  of existing evidence is blocked even in the privileged database fixture. Operational
  logging for rejected attempts, retention/archival and emergency break-glass procedures
  need production observability review in Stage 7.

## Operational limits and policy decisions

Inspect real data volume and query plans before launch. Current reports compute exact
counts with supporting indexes; no materialized statistics or background billing worker
is introduced. The branding queue paginates requests but includes retained per-account
branding history. Large historical workloads need indexed history pagination/archival
without deleting evidence. Every successful platform read adds an audit record; capacity,
monitoring and retention are Stage 7 release work.

User-facing access reasons and administrative history must avoid secrets and unnecessary
personal information. Review support/escalation instructions and the canonical official
site before launch. The current customer banner directs users to support or another
active account. Billing reactivation pages and payment grace rules are Stage 5/6 work;
there is no automatic subscription-driven suspension in Stage 4.

Stage 1 real invitation/recovery emails, actual schema/function bodies and ownership
remain pending. Stage 3 real Storage/MFA and historical branding reconciliation remain
pending. No production migrations, admin bootstrap, imports, merges or deployment may
occur without explicit approval. Stage 8 PDF/OCR/AI remains postponed; no paid API or
payment processing has been activated.
