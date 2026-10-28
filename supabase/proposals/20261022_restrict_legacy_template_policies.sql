-- Remove legacy broad FOR ALL policies. Their USING predicates were sufficient
-- for SELECT but inadvertently gave non-admin members DELETE rights.
-- Dedicated SELECT and restricted write policies already exist.
drop policy if exists cv_template_scope on public.certificate_templates;
drop policy if exists cv_fields_scope on public.certificate_fields;
