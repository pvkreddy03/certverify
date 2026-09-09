import { supabase } from "@/lib/supabase";

export type CertificateField = {
  id: string;
  field_name: string;
  field_type: string;
  is_required: boolean;
  is_public: boolean;
  display_order: number;
};

export async function getCertificateFields(templateId: string) {
  const { data, error } = await supabase
    .from("certificate_fields")
    .select(
      "id, field_name, field_type, is_required, is_public, display_order"
    )
    .eq("template_id", templateId)
    .order("display_order", { ascending: true });

  if (error) {
    throw new Error("Could not load certificate fields: " + error.message);
  }

  return (data ?? []) as CertificateField[];
}

export async function createCertificateFieldValues(
  values: {
    certificate_id: string;
    field_name: string;
    field_type: string;
    field_value: string | null;
    is_public: boolean;
    display_order: number;
  }[]
) {
  if (values.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("certificate_field_values")
    .insert(values);

  if (error) {
    throw new Error(
      "Could not save certificate field values: " + error.message
    );
  }
}