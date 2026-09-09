import { supabase } from "@/lib/supabase";

export type CertificateTemplate = {
  id: string;
  name: string;
  description: string | null;
};

export async function getCertificateTemplates() {
  const { data, error } = await supabase
    .from("certificate_templates")
    .select("id, name, description")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Could not load templates: " + error.message);
  }

  return (data ?? []) as CertificateTemplate[];
}