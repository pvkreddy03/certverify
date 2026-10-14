# Phase 8 — connected management tools handoff

This is an engineering handoff for the connected ChatGPT Supabase/Vercel tools. The
founder does not need to run commands, inspect logs, copy keys or paste SQL. Use the
current head of draft PR [#11](https://github.com/pvkreddy03/certverify/pull/11), not
an older deployment. No Production changes, merge, paid resource, real payment,
hosted schema installation or administrator grant is authorized by this document.

## Access and evidence at this checkpoint

On 13 October 2026, PR #11 is draft/open at
`9655b87260dd0b157fb9071d62836010e7e8375e`, targeting
`feat/stage-7-integration-readiness`. GitHub CI
[38353468702](https://github.com/pvkreddy03/certverify/actions/runs/38353468702)
passed unit, isolated PostgreSQL, browser contract, TypeScript, lint, production
dependency audit and build checks. This is code-validation evidence, not hosted
Auth/Storage/payment evidence.

The latest GitHub deployment status is **failed** for
`dpl_7YnbHUHwB2UpUcug52eafvNveQmi`; its deployment identifier URL is
`https://certverify-1p92doy29-pvkreddy03.vercel.app`. It is not a working test website.
The owner-reported error concerns Preview credentials after staging flags were fixed.
The ongoing code fix separates public build configuration from privileged service
credentials; use the final published PR head and its updated validation results.

This Codex environment exposes no Supabase/Vercel management methods or tool-search
method, no provider outbound identities and no provider management credentials.
Its three Supabase application variables have unknown readiness; their presence does
not prove staging scope. Known provider/preview requests previously failed at the
egress tunnel with HTTP 403. Do not retry those endpoints or bypass the proxy. GitHub
metadata remains accessible. Current staging emptiness and effective Vercel keys
cannot be independently established in this task.

Read-only local configuration comparison confirms this Cloud task's Supabase URL
still targets the protected original project. Its injected application bindings must
not be used for hosted staging tests. Local checks explicitly replace them with fixtures.
The initial continuation commit `665204fce37d4b5a2305c85101a9edac49245ce5` passed CI
[38397868130](https://github.com/pvkreddy03/certverify/actions/runs/38397868130), but
Vercel `dpl_BpyYAGJc9Wgr2CKechcP72KTWA9X` failed. Its GitHub status does not reveal
the build error. Inspect sanitized logs for the **final current PR head** before
changing any already-completed settings; do not assume the old private-key error persists.

## 1. Complete the Preview build without repeating completed setup

Use Vercel project `certverify`, ID `prj_yX5ltq28CGjvTo9iM7OtDH1A4z74`, team
`pvkreddy03` / `team_KIMakhoRensbMaOxm8okfCUC`.

1. Inspect the final PR #11 head and its new Preview deployment. The four staging
   flags and refreshed public Supabase bindings are already configured. Preserve
   them unless inspection demonstrates a specific wrong value or branch override.
2. Check effective **Preview-only** scope: `NEXT_PUBLIC_SUPABASE_URL` points to
   `https://nubohxesjeaodqcveiud.supabase.co`; its anon/publishable key is retrieved
   securely from that project. Production remains bound to
   `jhnxztaqfikgvkshifel` and must be unchanged. Never display key values in output.
3. Verify `SUPABASE_SECRET_KEY` securely belongs to staging and can invoke its
   privileged Auth API. A public build can succeed without this private credential;
   invitation administration, private logo operations and payments still require
   a validated privileged key when invoked. Repair only its Preview binding if
   necessary; never copy a Production credential. Do not report keys, Auth response
   bodies, tokens or signed diagnostic URLs.
4. Confirm the effective build command is `npm run build`, retaining the client
   secret scan. Keep Vercel-provided `VERCEL_ENV`/`VERCEL_URL` automatic. Leave
   Preview `NEXT_PUBLIC_APP_URL` absent or equal to this exact deployment origin;
   it must not inherit Production's URL. Request a new **Preview** build only if the
   new branch push has not already produced one.
5. Report exact deployed commit, build status and URL. A successful build alone is
   not permission to sign up or issue certificates before database installation.

## 2. Inspect staging and obtain the installation approval

Use Supabase project **`nubohxesjeaodqcveiud`**, name `certverify-staging`,
organization `vgaakofkotxijchzpkgo`, region `ap-south-1`. Verify these identities in
the management tool immediately before every database operation. The protected
project `jhnxztaqfikgvkshifel` is forbidden for this workflow.

Read-only inspection should record the existing application tables/migration ledger,
the count of `auth.users`, custom Auth triggers, branding bucket/policies and available
database extensions. Do not publish user records or raw function definitions. A fresh
installation requires **no existing CertVerify application tables and zero Auth
users**. If either exists, stop the fresh installer and prepare preservation/backfill
reconciliation; never delete data to make the installer pass.

Ask for one explicit approval to install the following eight reviewed SQL proposals
on this identified staging project only. Record final file hashes from the repository's
print-only `hosting:migrations` manifest. Install through connected tools after
approval; the founder must not be asked to paste SQL.

1. `supabase/staging/20261012_fresh_baseline.sql`
2. `supabase/proposals/20261012_stage1_account_security.sql`
3. `supabase/proposals/20261012_stage2_certificate_revocation.sql`
4. `supabase/proposals/20261012_stage3_branding.sql`
5. `supabase/proposals/20261012_stage4_platform_admin.sql`
6. `supabase/proposals/20261012_stage5_billing.sql`
7. `supabase/proposals/20261012_stage6_payments.sql`
8. `supabase/proposals/20261012_stage7_readiness.sql`

Each is a one-time transaction, not an idempotent installer. Record eight distinct
versions and hashes; the shared filename date is not a unique version. Execute one
file at a time, stop on the first error, confirm rollback, and diagnose before retrying
only the failed file. If a response is lost, inspect schema/ledger read-only before
retrying. Never execute `tests/database` fixtures in managed Supabase; Auth and
Storage must remain the genuine hosted schemas. Preserve all eight SQL files.

After installation, run `supabase/inspection/hosted-security-readonly.sql` privately
and the provider security advisor. Verify function grants/search paths, signup
triggers, tenant RLS, quota locks, immutable audits and private Storage policies.
Review intended public catalog/certificate/logo projections before revoking grants.
Do not apply protected-source reconciliation suggestions to the original project.

Include the separately reviewed `supabase/operations/sandbox-demo-catalog.sql` in
the requested **staging-only installation and synthetic catalog seed approval**.
After the eight installers/security checks, substitute its approval reference and
execute through the already-authorized database management operator. This is a
data preparation operation, not installer 9. It creates one visibly synthetic stored
free-trial plan (7 days, 5 certificates, 3 total seats) with immutable external-operator
audits. No owner identity, JWT/MFA claim, user, platform grant, subscription or payment
is created. App credentials cannot seed it; replay refuses. Customers can then select
the trial themselves through the existing pricing flow without requiring the founder
to configure a catalog before testing issuance. The eventual MFA-backed administrator
can edit/version the stored test plan normally.

## 3. Finish the genuine integrations

1. Configure staging Auth Site URL and exact confirmation, recovery and invitation
   redirects for the verified new Preview origin. Check the actual generated links.
   Keep email verification enabled; use approved consenting test inboxes. Confirm
   delivery restrictions or SMTP requirements without buying services.
2. Verify real signup, confirmation, login and recovery; one personal account/profile
   is created per user. Exercise organization creation, new/existing-user invitations,
   switching and immediate membership removal with historical activity preserved.
3. Verify templates/dynamic fields, certificate generation, QR PNG/JPEG downloads,
   public verification/private-field denial, revocation, branding uploads/approvals
   and historical issuer identity. Exercise direct cross-tenant REST/RPC and Storage
   requests, not only UI denials.
4. For the owner's staging account, require confirmation and real verified TOTP at
   `/account/security`. Request a **separate explicit administrator bootstrap
   approval** for that verified Auth UUID. Execute the reviewed
   `supabase/operations/sandbox-owner-bootstrap-management.sql` through the connected
   management tool, substituting only the independently verified Auth UUID and recorded
   approval reference with safely quoted values. Unsubstituted placeholders fail closed.
   The older psql template must not be sent verbatim to `execute_sql`. No personal
   identity is hardcoded; no public signup path grants platform permissions.
5. With MFA-backed admin access, prepare labeled synthetic plans, trials and offers.
   Test owner/admin/member billing permissions, quotas, expiries, audits and public
   verification after expiry. No automatic unlimited production entitlement is seeded.
6. Keep `CERTVERIFY_PAYMENT_MODE=disabled` until a reviewed sandbox/simulation
   configuration is ready. For genuine Razorpay sandbox checks, securely configure
   only `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET` and
   `RAZORPAY_TEST_WEBHOOK_SECRET`; use `razorpay_test` mode and the exact HTTPS
   `/api/payments/webhook` route. Never use live keys or real cards. Review any
   Vercel protection exception narrowly so gateway webhook delivery is possible
   without exposing administrative pages. A labeled local/simulated payment is not
   evidence of genuine Razorpay capture, refund or webhook delivery.

Record each hosted outcome with exact commit/project, time, sanitized identity aliases,
expected authorization denials and safe record identifiers. Do not put passwords,
TOTP seeds, session tokens, private certificate fields or gateway secrets in reports,
screenshots or traces. Any unavailable hosted journey stays **not tested**.

## Final acceptance

Return a URL only after independently opening that exact Preview and testing real
signup/login plus certificate issuance/public QR verification against staging. Explain
any simulated payment feature and remaining owner-only MFA step clearly. Do not label
the site fully functional while migrations or required hosted integrations are blocked.
The owner should only need to approve the named staging installation/privilege operation,
complete their own MFA, and open the finished website. All routine engineering and
provider configuration belongs to the technical agents.
