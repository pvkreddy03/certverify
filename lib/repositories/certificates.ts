import { supabase } from "@/lib/supabase";
import { requireSelectedAccountId } from "@/lib/accounts/context";

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function generateCertificateId(accountId?: string) {
  if (accountId && accountId !== requireSelectedAccountId()) throw new Error("Account changed. Please reload.");
  const { data, error } = await supabase.rpc("cv_generate_certificate_id");
  if (error) throw new Error("Could not generate Certificate ID: " + error.message);
  return data as string;
}

export async function getCurrentAccountId() {
  return requireSelectedAccountId();
}

export async function createCertificate(certificate: {
  user_id: string;
  account_id: string;
  certificate_id: string;
  template_id: string;
  status: string;
  replaces_certificate_id?: string | null;
  report_format_id?: string | null;
  cover_letter_format_id?: string | null;
}) {
  /*
   * Get the template name at the exact moment the certificate
   * is created.
   *
   * This creates a permanent snapshot of the name so that
   * deleting or renaming the template later will NOT change
   * the historical certificate.
   */
  const { data: template, error: templateError } = await supabase
    .from("certificate_templates")
    .select("id, name")
    .eq("id", certificate.template_id)
    .single();

  if (templateError) {
    throw new Error(
      "Could not load the selected template: " +
        templateError.message
    );
  }

  if (!template?.name) {
    throw new Error("The selected template could not be found.");
  }

  const { data, error } = await supabase
    .from("certificates")
    .insert({
      ...certificate,
      template_name: template.name,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}