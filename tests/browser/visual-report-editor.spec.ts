import { test, expect } from "@playwright/test";

const templateId = "41000000-0000-0000-0000-000000000001";
const fieldId = "42000000-0000-0000-0000-000000000001";
const accountId = "10000000-0000-0000-0000-000000000001";
const wordNs = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// A real ZIP-formatted OOXML fixture with an ordinary paragraph and a table.
function sampleDocx() {
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="' + wordNs + '"><w:body>' +
    '<w:p><w:r><w:t>VALUATION REPORT</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t xml:space="preserve">Client: John Smith</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Applicant</w:t></w:r></w:p></w:tc>' +
    '<w:tc><w:p><w:r><w:t>John Smith</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:sectPr/></w:body></w:document>';
  const files = [
    { name: "[Content_Types].xml", data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: "_rels/.rels", data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: "word/document.xml", data: Buffer.from(xml) },
  ];
  let offset = 0;
  const local: Buffer[] = [], central: Buffer[] = [];
  for (const f of files) {
    const name = Buffer.from(f.name), crc = crc32(f.data);
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(f.data.length, 18); header.writeUInt32LE(f.data.length, 22);
    header.writeUInt16LE(name.length, 26); name.copy(header, 30);
    const record = Buffer.alloc(46 + name.length);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(f.data.length, 20);
    record.writeUInt32LE(f.data.length, 24); record.writeUInt16LE(name.length, 28);
    record.writeUInt32LE(offset, 42); name.copy(record, 46);
    local.push(header, f.data); central.push(record);
    offset += header.length + f.data.length;
  }
  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/test/reset");
});

test("visually map text in a DOCX, save the template and download a populated Word file", async ({ page }) => {
  let saved: { id: string; format_name: string; storage_path: string; bindings: Array<{ fieldName: string; start: number; end: number }> } | null = null;
  let storedDocx: Buffer | null = null;
  await page.route("**/storage/v1/object/**", async route => {
    if (!route.request().url().includes("/certverify-word-formats/")) return route.continue();
    const method = route.request().method();
    if (method === "POST") {
      storedDocx = route.request().postDataBuffer();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "fixture" }) });
    }
    if (method === "GET" && storedDocx) return route.fulfill({ status: 200,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: storedDocx });
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await page.route("**/rest/v1/certificate_templates*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ id: templateId, user_id: "00000000-0000-0000-0000-000000000001", account_id: accountId }),
  }));
  await page.route("**/rest/v1/certificate_fields*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify([{ id: fieldId, field_name: "Client Name", field_type: "text" }]),
  }));
  await page.route("**/rest/v1/cv_report_format_library*", async route => {
    if (route.request().method() === "POST") {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: "" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(saved ? [saved] : []) });
  });

  await page.goto("/login");
  await page.getByLabel("Email address").fill("existing@example.test");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/dashboard/templates/" + templateId + "/report");
  await expect(page.getByRole("heading", { name: "Create and manage Word report formats" })).toBeVisible();

  await page.getByRole("textbox", { name: "Word format name" }).fill("SBI Open Plot");
  await page.getByLabel("Upload Word report").setInputFiles({
    name: "Valuation.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: sampleDocx(),
  });
  await expect(page.getByText("Client: John Smith", { exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "John Smith" })).toBeVisible();

  // Select the name visually within paragraph 2; no {{placeholder}} is typed.
  await page.locator('[data-docx-p="1"]').evaluate(element => {
    const text = element.querySelector("span")!.firstChild!;
    const range = document.createRange();
    range.setStart(text, 8); range.setEnd(text, 18);
    const selection = window.getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect(page.getByText("John Smith", { exact: true }).first()).toBeVisible();
  await page.getByRole("combobox", { name: /Choose a certificate field/ }).selectOption(fieldId);
  await page.getByRole("button", { name: "Link selected area to field" }).click();
  await expect(page.getByText("Mapped locations · 1")).toBeVisible();

  await page.getByPlaceholder("Example value").fill("Alice Rao");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download sample .docx" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Sample-Valuation.docx");
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(await file.path());
  expect(bytes.subarray(0, 2).toString()).toBe("PK");
  expect(bytes.toString()).toContain("Client: Alice Rao");
  expect(bytes.toString()).toContain("Applicant");

  await page.getByRole("button", { name: /Save report format/ }).click();
  await expect(page.getByText("Private Word format and visual field mappings saved. Other formats under this template are unchanged.")).toBeVisible();
  expect(saved).not.toBeNull();
  expect(saved!.bindings[0]).toMatchObject({ fieldName: "Client Name", start: 8, end: 18 });
  expect(saved!.format_name).toBe("SBI Open Plot");
  expect(saved!.storage_path).toContain("/" + templateId + "/");
  expect((storedDocx as Buffer | null)?.includes(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
});
