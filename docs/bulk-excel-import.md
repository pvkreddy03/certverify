# Bulk Excel certificate generation (staging)

## User journey

Create Certificate → **Bulk Excel**. Select one existing certificate template. Download the real XLSX template, or upload a customer's own XLSX workbook (first worksheet, first row contains unique column headers). The server reads up to **100 nonempty certificate rows** from a file up to **1 MB** and returns the values for preview only. The workbook is not uploaded to permanent object storage.

Match each certificate field to exactly one Excel column, review every row, edit cells and remove unwanted rows. Mandatory fields, text length, numeric values, dates and organization quota are checked before confirmation. Dates must be text in `YYYY-MM-DD` format; formulas, macros and external links are not accepted. All certificate fields from the selected template must be mapped. Values marked private by the template remain private.

On confirmation, the browser sends reviewed field-value rows and a per-import UUID key to the account-scoped `cv_create_certificate_batch` PostgreSQL RPC. That function verifies active identity, membership, template/account ownership, all fields and limits, and locks the account before issuing. Existing certificate numbering, status defaults, company branding snapshots and subscription usage triggers run for each record. The transaction is atomic: if certificate 100 fails, records, counters and sequence changes for prior rows are rolled back.

The batch is only a grouping record. Each certificate has its own database row, unique verification reference and public QR. A single batch can be listed later, viewed as individual certificates, and downloaded as a ZIP of JPEG QR images (default) or PNG QR images plus a `certificate-list.csv` mapping certificate IDs to verification URLs. Generated QR image files are not permanently stored; approved company logos are still shared.

### Quota and rerun behavior

The limit of **100 per upload** is separate from the subscription's remaining certificate allowance. A customer with 23 remaining can issue at most 23 in that batch. The browser shows remaining quota when the billing status is available; the database always remains authoritative.

The idempotency UUID and canonical payload digest are stored with the batch. A repeated request with the same key and identical fields returns the existing batch; a reused key with changed rows is rejected, not duplicated. After a network failure, users should inspect Bulk Imports before generating another batch.

### Permissions and boundaries

- Organization owner/admin can view that organization's batches. Sub-users can generate under their organization's entitlement but only list their **own** batches, unless an owner/admin grants broader role access elsewhere.
- Anonymous/public visitors cannot query the batch tables; the public certificate verification endpoint exposes only fields approved as public.
- Certificates are never updated/deleted as part of bulk grouping; revocation, replacement and audit continue to work per certificate.
- No new payment provider integrations. No data copied to production.
- Newly issued codes must use the stable public verification hostname. Before commercial launch, replace the staging hostname with the permanent production domain.

### Testing

- Unit tests in `tests/bulk-xlsx.test.ts` verify generated XLSX round trips and rejects >100 rows.
- Browser contract in `tests/browser/bulk-excel.spec.ts` confirms editable preview, one-click idempotent import, individual results and QR ZIP download.
- A live staging transaction tested a two-certificate batch, repeated confirmation and 101-row rejection, then rolled back. No actual staging certificates/quota consumed.
- Full CI must pass at the **latest exact branch head** before the feature is marked ready.
