# Supabase migrations

This directory is reserved for version-controlled SQL migrations managed with the Supabase CLI.

**Do not add a guessed baseline migration or run `supabase db reset` against the existing CertVerify production project.** The live database contains existing tables and data, while its migration history currently reports no recorded migrations.

Before the first migration is added, capture and review the live schema and security policies, then establish an appropriate baseline so existing objects are adopted rather than recreated. Until that is complete, use reviewed, additive migrations only in a separate development environment and do not automate production database changes.
