# Stage 5 — Supabase integration and release gates

All Stage 5 database changes remain proposals. Local tests cannot certify production
function bodies, privileges, historic ownership or genuine Supabase Auth behavior.
Do not apply these proposals to production without explicit approval.

## Schema review and isolated integration

1. Supply `CERTVERIFY_READONLY_DATABASE_URL` through secure environment settings, never
   chat or committed files. Run `npm run inspect:db -- --stage=5`, alongside the Stage
   1/3/4 inspections. The runner verifies TLS and writes ignored private reports.
   Review actual SQL functions, SECURITY DEFINER search paths, RLS, table/column grants,
   inherited/default service-role privileges, triggers and Storage policies. Stage 5
   preflight reports metadata; raw function bodies remain private.
2. Provision an isolated Supabase development project. Review and apply Stage 1–5
   proposals there only, reconciling real schema differences first. Resolve historical
   template ownership, immutable issuer branding, existing administrative suspensions
   and invitation/recovery integration from the earlier stage checklists.
3. Inventory existing subscriptions and financial evidence. Prepare a separately reviewed
   import retaining original plan versions, prices, periods, paid provenance, usage,
   seats and cancellation history. Stage 5 represents free/trial/complimentary access,
   not verified paid settlement. Extend the schema with the Stage 6 paid activation
   path before importing actual paid periods; never relabel paid periods as waived.
   There is no automatic free/unlimited entitlement for existing accounts. Until
   provisioned, account sign-in/history/billing works but paid writes fail closed.
4. Bootstrap a reviewed confirmed-email platform administrator and real TOTP MFA only
   through an approved privileged operation. Verify authenticated `aal1` and ordinary
   organization owners cannot read/manage pricing administration or financial reports;
   only approved platform membership with genuine `aal2` can perform these operations.
5. Confirm all new tables are RLS-protected and direct public/anon/authenticated/service
   grants are revoked. Test against actual Supabase default privileges, roles and API
   schemas. Browser/server code must not acquire direct financial table writes or
   private period-activation functions. Existing Storage finalization must still work
   through its checked Stage 3 flow. Stage 6 should grant a narrow verified-settlement
   interface, not restore broad financial table permissions.

## Required real integration journeys

- Test real verified/unverified Auth users, signed JWTs, stale sessions, member removal,
  organization switching and forged account headers. Recheck account membership after
  lock waits. Test raw REST/RPC access as owner/admin/member/removed user/other tenant,
  plus service credentials in the isolated project only. Financial targeting criteria
  and other tenants' account identifiers must not leak through quotes or history.
- Configure editable test plans/campaigns. Confirm exact minor-unit math, currency
  precision, additional seats, monthly calendar and leap-year annual boundaries,
  visibility/eligibility, expiry, retirement, optimistic revision conflicts and immutable
  old terms. Attempt client amount/payment/intent overrides. New enrollment must reject
  deactivated plans after quoting while genuine historical renewals retain agreed terms.
- Test one-time trials, campaign audiences/plan limits, scheduled expiry, stale/expired
  quotes, idempotent retries, global concurrent redemption limits and per-account
  duplicates. Accepted introductory cycles honor captured terms after campaign expiry.
  Standard plan trials are first-enrollment only; trial history cannot be reset.
- Race issuance, member/invitation reservation, subscription transitions and account
  suspension with real HTTP and SQL transactions. Quota/seat checks must remain atomic;
  failed writes roll back consumption. Pending unexpired invitations consume seats,
  acceptance substitutes its own reservation, removal frees a seat without deleting
  history. Include genuine invitation emails and existing-user acceptance from Stage 1.
- Test period expiry through real time in the isolated project, next-boundary scheduled
  changes, scheduled seat reductions and incompatible changes requiring review. No
  quota reset occurs mid-period. No background worker currently materializes periods;
  trusted billing/paid-operation checks perform lazy materialization. Missed periods
  must not silently extend entitlement.
- Verify expiry blocks issuance/templates/new invitations/paid branding writes through
  direct database paths while preserving billing, member reads, certificate status
  maintenance and QR verification with historical branding. Administrative suspension
  remains distinct; owner renewal cancellation still works while suspended.
- Confirm every approved financial transition records actor, reason where required,
  timestamp and stable references in immutable billing/platform/organization audits.
  Attempts to rewrite quote terms, paid amounts, trial history, consumed usage or event
  evidence must fail. Payment ledger events alone cannot activate paid access.
- Verify real logo uploads, scoped branding permissions and approval after adding
  entitlement triggers. Public historical logos/verification survive billing expiry.
  Stage 3 Storage and MFA checks remain release gates; mocks are not proof of delivery.

## Stage 6 payment prerequisites

Keep the disabled provider adapter and unconfigured intents until explicit payment
approval. Add provider-specific attempt identifiers separate from immutable Stage 5
intent records; verify signatures on raw webhook bytes, merchant/intent identity,
amount/currency, state transitions and event idempotency before narrow paid settlement.
Reserve coupon redemption capacity before initiating any payable checkout so a customer
cannot be charged and subsequently fail entitlement activation due to exhausted offers.
Revalidate quote expiry, seat eligibility and account state; define refund/compensation
for failures. Duplicate events must not duplicate periods, revenue or audit events.

Implement reviewed immediate-upgrade/proration semantics without resetting quota,
renewal notifications, invoices/taxes, failed payments, configurable grace periods,
provider cancellation and background processing. Plan changes cannot silently reprice
existing contracts. Publish actual commercial terms, trial/discount stacking and
renewal consent before launch; editable example prices are not approved published plans.

Production migration/import/admin bootstrap/merge/deployment and live charges require
explicit approval. No paid AI processing is needed for QR verification. Stage 8 remains
postponed.
