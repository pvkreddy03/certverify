import { supabase } from "@/lib/supabase";

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function generateCertificateId(accountId?: string) {
  const { data, error } = await supabase.rpc("generate_certificate_id", {
    p_account_id: accountId ?? null,
  });

  if (error) {
    throw new Error("Could not generate Certificate ID: " + error.message);
  }

  return data as string;
}

export async function getCurrentAccountId(userId: string) {
  /*
   * Get the user's active account through a SECURITY DEFINER
   * database function instead of querying account_members
   * directly from the browser.
   */
  const { data, error } = await supabase.rpc("get_current_account_id");

  if (error) {
    throw new Error("Could not find your account: " + error.message);
  }

  if (!data) {
    throw new Error("No active account was found for this user.");
  }

  return data as string;
}

export async function createCertificate(certificate: {
  user_id: string;
  account_id: string;
  certificate_id: string;
  template_id: string;
  status: string;
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