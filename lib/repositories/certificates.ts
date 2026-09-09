import { supabase } from "@/lib/supabase";

export async function getCurrentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function generateCertificateId() {
  const { data, error } = await supabase.rpc("generate_certificate_id");

  if (error) {
    throw new Error("Could not generate Certificate ID: " + error.message);
  }

  return data as string;
}

export async function createCertificate(certificate: {
  user_id: string;
  certificate_id: string;
  template_id: string;
  status: string;
}) {
  const { data, error } = await supabase
    .from("certificates")
    .insert(certificate)
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}