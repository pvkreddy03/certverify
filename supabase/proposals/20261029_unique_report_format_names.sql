-- Client-entered report format titles are unique per workspace + certificate template.
-- Existing stored DOCX paths remain opaque and unchanged; only the display title is user-facing.
create unique index if not exists cv_report_format_unique_named_template
on public.cv_report_format_library (account_id, template_id, lower(btrim(format_name)));
