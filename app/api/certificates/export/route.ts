import { authenticatedRequest, requestErrorResponse, RequestError } from "@/lib/auth/request";
import { publicVerificationUrl } from "@/lib/certificates/public-verification-url";
import {
  buildCertificateExportSheets,
  packageCertificateExport,
  parseExportDates,
  type ExportCertificate,
  type ExportValue,
} from "@/lib/certificates/export-workbook";
import { WorkbookError } from "@/lib/bulk/xlsx";

export const runtime = "nodejs";

const PAGE_SIZE = 500;
const MAX_CERTIFICATES = 20000;
const VALUE_BATCH_SIZE = 100;

export async function POST(request: Request) {
  try {
    const { client, accountId } = await authenticatedRequest(request);
    if (!accountId) throw new RequestError("Select your certificate workspace.", 400);
    if (Number(request.headers.get("content-length") || 0) > 4096) {
      throw new RequestError("Invalid export request.", 400);
    }
    let body: { from?: unknown; to?: unknown };
    try {
      body = await request.json() as { from?: unknown; to?: unknown };
    } catch {
      throw new RequestError("Select a valid export date range.", 400);
    }
    const { begin, after, from, to } = parseExportDates(body.from, body.to);

    // The request's selected-account header is only a hint, never permission.
    // Validate active selected membership and use user-scoped PostgREST queries.
    const { data: scopedAccount, error: accessError } = await client.rpc("cv_selected_account");
    if (accessError || scopedAccount !== accountId) {
      throw new RequestError("You no longer have access to that account.", 403);
    }

    const certificates: ExportCertificate[] = [];
    for (let offset = 0; offset <= MAX_CERTIFICATES; offset += PAGE_SIZE) {
      let query = client.from("certificates")
        .select("id,certificate_id,template_id,template_name,public_verification_id,status,created_at,user_id")
        .eq("account_id", accountId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (begin) query = query.gte("created_at", begin);
      if (after) query = query.lt("created_at", after);
      const { data, error } = await query;
      if (error) throw new RequestError("Could not read certificate records for the selected account.", 503);
      const page = (data ?? []) as ExportCertificate[];
      certificates.push(...page);
      if (certificates.length > MAX_CERTIFICATES) {
        throw new RequestError("This export exceeds 20,000 certificates. Choose a shorter date range and download in parts.", 422);
      }
      if (page.length < PAGE_SIZE) break;
    }
    if (!certificates.length) throw new RequestError("No certificates found in the selected date range.", 404);

    // Stored field snapshots are used so renamed/deleted template field definitions
    // do not change historical certificate exports.
    const values: ExportValue[] = [];
    const creatorIds = new Set<string>();
    for (const certificate of certificates) creatorIds.add(certificate.user_id);
    for (let i = 0; i < certificates.length; i += VALUE_BATCH_SIZE) {
      const ids = certificates.slice(i, i + VALUE_BATCH_SIZE).map(c => c.id);
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await client.from("certificate_field_values")
          .select("certificate_id,field_name,field_type,field_value,display_order")
          .in("certificate_id", ids)
          .order("certificate_id", { ascending: true })
          .order("display_order", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new RequestError("Could not read certificate field values.", 503);
        const page = (data ?? []) as ExportValue[];
        values.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
    }

    const creators = new Map<string,string>();
    const list = [...creatorIds];
    for (let i = 0; i < list.length; i += 100) {
      const { data } = await client.from("profiles")
        .select("user_id,professional_name,email")
        .in("user_id", list.slice(i, i + 100));
      for (const profile of data ?? []) {
        creators.set(profile.user_id,
          profile.professional_name?.trim() || profile.email?.trim() || profile.user_id);
      }
    }

    const sheets = buildCertificateExportSheets(
      certificates, values, creators,
      reference => publicVerificationUrl(reference, new URL(request.url).origin),
    );
    if (sheets.length > 120 * 30) {
      throw new RequestError("Too many templates for one download. Export a shorter date range.", 422);
    }
    const { bytes, contentType, extension } = packageCertificateExport(sheets);
    const filename = "certverify-certificates-" + (from ?? "all") +
      (to ? "-to-" + to : "") + "." + extension;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": 'attachment; filename="' + filename + '"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof WorkbookError) {
      return Response.json({ error: error.message }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
    }
    return requestErrorResponse(error);
  }
}
