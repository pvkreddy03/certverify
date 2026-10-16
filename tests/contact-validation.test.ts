import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePublicContact } from "../lib/platform/contact-validation";

test("allows blank and populated public contact details", () => {
  assert.equal(parsePublicContact({}).support_email, "");
  assert.equal(parsePublicContact({support_email:"help@example.com",support_phone:"+91 98765 43210",website_url:"https://example.com/help",help_text:"Business hours"}).support_phone, "+91 98765 43210");
});
test("rejects invalid email, insecure links and unexpected fields", () => {
  for (const contact of [{support_email:"wrong"}, {website_url:"javascript:alert(1)"}, {website_url:"http://test.com"}, {is_admin:true}]) {
    assert.throws(() => parsePublicContact(contact));
  }
});
