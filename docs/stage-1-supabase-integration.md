# Stage 1 Supabase integration: separate release gate for PR #4

PR #4 already exists. Do not create a duplicate or change networking for PR creation.
Local PostgreSQL and browser-contract tests passed; actual deployed function bodies,
historical ownership and real email delivery remain **pending**, not verified.

Stage 2's positive issuance tests also found a Stage 1 policy visibility defect:
the STABLE same-table helper cannot see an inserted certificate during RETURNING.
The correction is prepared in Stage 2's unapplied proposal. Do not deploy Stage 1
alone without reviewing/backporting that correction or reviewing the combined
Stage 1/2 database rollout. A successful INSERT returning its ID must be part of
the real Supabase integration matrix, not only negative authorization tests.

## Read-only inspection prepared

`npm run inspect:db` executes `supabase/inspection/stage1-readonly.sql` in an explicitly
read-only transaction. Supply `CERTVERIFY_READONLY_DATABASE_URL` through secure
environment settings using a metadata/data-read account. A URL is not currently
available to this task. HTTPS Supabase API keys do not provide PostgreSQL schema/body
inspection access. If the database requires a custom trusted CA, supply its path as
`CERTVERIFY_DB_CA_FILE`; TLS verification is always enabled.

The report goes into ignored `.certverify-private` with restricted file permissions.
It captures function definitions/signatures/security-definer settings/ACLs, actual
trigger definitions (including Auth), RLS expressions, grants, columns, constraints,
indexes, default privileges, ownership candidates and duplicate public labels. It
does not query password hashes, session tokens, invitation tokens or email addresses.
Function bodies may nevertheless contain sensitive literals: never commit the raw
report. Sanitize and review it before preparing a migration baseline.

Review every relevant overload: invitation acceptance/creation/revocation,
`get_current_account_id`, membership/admin helpers, upgrades, certificate ID generation,
certificate revocation, public scan logging and signup/profile/account triggers.
Check owner/search_path and PUBLIC/anon/authenticated execute grants. Test that no
remaining security-definer mutation bypasses removed membership or selected context.
Inspect trigger-created personal accounts for invited users and actual Auth password
columns/confirmation behavior before approving Stage 1's proposal.

## Historical template ownership

Keep all existing records and IDs. Build a reviewed mapping containing template ID,
creator, proposed account, supporting evidence and reviewer approval. The inspection
reports active memberships and accounts on already-issued certificates. Neither is
an automatic instruction to assign ownership. Templates referenced by multiple
accounts or creators with multiple memberships need explicit review; do not choose
the oldest membership. Do not overwrite certificate field/template snapshots.

In an isolated restored schema, verify mapping completeness, foreign-key validity,
orphaned fields, creator/admin/member access, and visibility of existing certificates.
Record unresolved cases; deploy neither the new template policy nor application
changes while historical templates would become unintentionally inaccessible.
Production backfill and migration application require separate approval and a
reviewed backup/rollback plan.

## Real invitation/recovery email matrix (isolated Supabase only)

Prepare a separate Supabase development project with reviewed schema, application
test credentials, test mailboxes/SMTP, and a preview or Codespaces URL. Never reuse
production customer mailboxes, send production invitations, or change production
Auth templates/settings for this matrix.

| Journey | Expected evidence |
| --- | --- |
| New email | One Auth identity; email lands on setup page; name/matching password required; verified recipient joins intended account |
| Existing confirmed user | Existing password preserved; authenticate with existing credentials; second membership added |
| Existing unconfirmed user | Confirmation succeeds; existing password preserved; no duplicate identity |
| Resend | New app token, old token fails; expiry refreshed; duplicate pending record prevented |
| Cancellation/expiry | Clear error; no membership granted |
| Wrong logged-in recipient | No unintended membership; correct recipient can recover via newest link |
| Link replay/concurrent acceptance | Exactly one membership transition and acceptance audit |
| Acceptance racing resend | At most one app-token path succeeds; no orphan privileged membership |
| Provider timeout/failure | New reservation cancelled or visibly flagged for reconciliation; no claim of exactly-once delivery |
| Removed member/reinvited admin | Access removed immediately; history retained; reinvitation does not silently restore admin privileges |
| Recovery | Fresh email proof, matching password, session cleanup; expired/reused link fails |
| Cross-device/preview | Exact rendered URL preserves app token and Auth proof; allowlists and token-hash templates work across browsers |

Record app commit, inspected schema revision, sanitized screenshots, audit counts and
actual outcomes. Do not store raw links, JWTs, passwords or mailbox contents in Git.
Validate default and custom Supabase email templates and the exact Auth callback type;
do not assume the contract fixture reproduces live SDK/SMTP behavior.

No production data/settings or migration history has been changed. These integration
checks remain a separate prerequisite to releasing Stage 1 and dependent Stage 2.
