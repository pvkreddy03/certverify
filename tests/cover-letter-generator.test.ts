import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PLACEMENT, fillCoverText, validatePlacement } from "../lib/cover-letters/generator";

test("cover letter replaces certificate fields and leaves no unexpanded placeholders", () => {
  assert.equal(
    fillCoverText("Report {{Certificate Number}}\nFor {{ Property Address }}", {
      "Certificate Number": "CV-2026-001", "Property Address": "Bhongir",
    }),
    "Report CV-2026-001\nFor Bhongir"
  );
  assert.equal(fillCoverText("{{missing}}", {}), "");
  assert.equal(fillCoverText("{{DATE}}", { Date: "30/10/2026" }), "30/10/2026");
});

test("QR and text must remain on the printable page", () => {
  assert.doesNotThrow(() => validatePlacement(DEFAULT_PLACEMENT));
  assert.throws(() => validatePlacement({ ...DEFAULT_PLACEMENT, qr_x: 0.95 }), /QR code/);
  assert.throws(() => validatePlacement({ ...DEFAULT_PLACEMENT, text_y: 0.95 }), /Text area/);
  assert.throws(() => validatePlacement({ ...DEFAULT_PLACEMENT, qr_size: 0.03 }), /QR code/);
});
