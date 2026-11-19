import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { pdfToText } from "./pdf-to-text.ts";

const hasPdftotext = spawnSync("pdftotext", ["-v"]).error === undefined;
// Minimal one-page PDF containing the text "Hello NM40".
const PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 20 50 Td (Hello NM40) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R/Size 6>>
%%EOF`;

describe("pdfToText", () => {
  it.skipIf(!hasPdftotext)("extracts text from a PDF", async () => {
    expect(await pdfToText(new TextEncoder().encode(PDF))).toContain("Hello NM40");
  });
});
