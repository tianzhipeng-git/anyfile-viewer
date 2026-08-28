// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

import { createImageOnlyScanPdf } from "./pdf-test-fixture";

describe("PDF.js engine", () => {
  it("parses a generated image-only scan without strict error escalation", async () => {
    const task = getDocument({ data: createImageOnlyScanPdf() });

    try {
      const document = await task.promise;
      const page = await document.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const operators = await page.getOperatorList();

      expect(document.numPages).toBe(1);
      expect(viewport.width).toBe(240);
      expect(viewport.height).toBe(160);
      expect(operators.fnArray).toContain(OPS.paintImageXObject);
    } finally {
      await task.destroy();
    }
  });
});
