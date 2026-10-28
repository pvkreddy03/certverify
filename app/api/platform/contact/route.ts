import { platformContext, platformError, privateJson } from "@/lib/platform/server";
import { RequestError } from "@/lib/auth/request";
import { parsePublicContact } from "@/lib/platform/contact-validation";

export async function GET(request: Request) {
  try {
    const { client } = await platformContext(request);
    const { data, error } = await client.rpc("cv_platform_contact_settings");
    if (error) throw new RequestError("Contact settings are not installed or unavailable.", 503);
    return privateJson(data);
  } catch (error) { return platformError(error); }
}

export async function POST(request: Request) {
  try {
    const { client } = await platformContext(request);
    let contact;
    try { contact = parsePublicContact(await request.json()); }
    catch (error) {
      throw new RequestError(error instanceof Error ? error.message : "Invalid contact details.", 400);
    }
    const { data, error } = await client.rpc("cv_save_platform_contact_settings", { p_contact: contact });
    if (error || data !== true) throw new RequestError("Contact details were not saved. Check the staging migration and try again.", 503);
    return privateJson({ success: true, contact });
  } catch (error) { return platformError(error); }
}
