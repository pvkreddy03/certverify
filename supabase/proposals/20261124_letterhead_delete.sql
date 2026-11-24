-- Permit only owners/admins of the active workspace to delete reusable letterheads.
-- Existing certificates remain intact (their optional letterhead FK is ON DELETE SET NULL).
begin;
grant delete on public.cv_cover_letter_templates to authenticated;
create policy cv_cover_letter_delete on public.cv_cover_letter_templates
for delete to authenticated using (
  account_id = public.cv_selected_account()
  and public.cv_account_role(account_id) in ('owner','admin')
);
commit;
