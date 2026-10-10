# CertVerify development and release workflow

## Current safe workflow

- Work on a feature or automation branch, not directly on `main`.
- GitHub Actions runs ESLint, TypeScript checking, and the Next.js production build.
- Existing ESLint errors are currently reported but non-blocking so type-check/build results can still be evaluated. This is temporary technical debt; restore blocking lint after the existing errors are resolved in a separately reviewed change.
- Review the checks and code changes before merging a pull request to `main`.
- Vercel creates preview deployments for branch pushes and can deploy `main` to production when its Git integration is configured to do so.
- Database changes must be reviewed separately. The CI workflow does not connect to or modify Supabase.

## Supabase migration safety

The existing CertVerify Supabase project already contains application tables and data, but the connected migration listing returned no recorded migrations. Do not run `supabase db reset`, drop tables, or apply a guessed initial schema to production.

Before enabling migration deployment:

1. Capture the existing schema, indexes, constraints, functions, triggers, grants, and row-level security policies.
2. Review the schema snapshot against the live database.
3. Establish a migration baseline using the Supabase CLI's supported baseline/adoption workflow; do not replay table-creation SQL against the live project.
4. Test subsequent additive migrations against a separate development database or branch first.
5. Keep production migration execution manual/approval-gated until a staging workflow and backup/restore plan have been verified.

## Secrets

- Never commit `.env.local`, Supabase service-role keys, database passwords, or access tokens.
- Public Supabase URL and publishable/anon key are client configuration, not substitutes for server-side secrets.
- CI uses placeholder public values only to compile the app; they must never be used in a deployed environment.
- Add any deployment credentials only as encrypted GitHub Actions secrets or protected environment secrets after confirming the exact workflow needs them.

## Initial rollout

This first workflow deliberately runs code validation only. It does not run SQL, deploy database migrations, alter Vercel project settings, or change application features.
