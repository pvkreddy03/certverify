# Supabase migrations

This directory is reserved for version-controlled SQL migrations managed with the Supabase CLI.

**Do not add a guessed baseline migration or run `supabase db reset` against the existing CertVerify production project.** The live database contains existing tables and data, while its migration history currently reports no recorded migrations.

Before the first migration is added, capture and review the live schema and security policies, then establish an appropriate baseline so existing objects are adopted rather than recreated. Until that is complete, use reviewed, additive migrations only in a separate development environment and do not automate production database changes.


## Live schema inventory snapshot

A metadata-only snapshot captured from the connected CertVerify Supabase project is stored at `docs/supabase-live-schema-inventory.json`. It contains table/column definitions, constraints, indexes, RLS policy expressions, trigger metadata, and function signatures/security-definer flags. It does not contain table row data, credentials, function bodies, or secrets.

This snapshot is an inspection aid, **not** an executable migration and not a complete database backup. The production project currently reports no recorded migrations. Before migration automation is enabled, use the Supabase CLI to pull the full schema into a migration file, carefully review it, and reconcile migration history without replaying schema creation against production.
