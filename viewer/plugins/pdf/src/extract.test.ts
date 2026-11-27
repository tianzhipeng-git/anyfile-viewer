// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_READ_MAX_BYTES, type ExtractContext, type VendorAssets } from "@anyfile/viewer-protocol";
import { assertExtractorCompliance, createBufferBinarySource } from "@anyfile/viewer-test";

import extractor from "./extract";

const EXAMPLES = resolve(process.cwd(), "examples");
/** The prepared `public/vendor/` tree (pdf.js CMaps and standard fonts). */
const VENDOR_ROOT = resolve(process.cwd(), "../../../public/vendor");
const vendor: VendorAssets = {
  url: async (path) => pathToFileURL(resolve(VENDOR_ROOT, path)).href,
  bytes: async (path) => new Uint8Array(readFileSync(resolve(VENDOR_ROOT, path))),
};

function context(name: string): ExtractContext {
  const filePath = resolve(EXAMPLES, name);
  const bytes = new Uint8Array(readFileSync(filePath));
  return {
    source: createBufferBinarySource(bytes, name, filePath),
    file: new File([bytes], name),
    vendor,
    signal: new AbortController().signal,
  };
}

describe("pdf ./extract", () => {
  it("passes extractor compliance on the real PDF samples", async () => {
    await assertExtractorCompliance(extractor, [
      {
        name: "multipage-outline.pdf",
        filePath: resolve(EXAMPLES, "multipage-outline.pdf"),
        targetId: "page:2",
        filter: "column",
        invalidBytes: new TextEncoder().encode("%PDF-1.7\nnot really a pdf"),
      },
      { name: "demo.pdf", filePath: resolve(EXAMPLES, "demo.pdf") },
    ]);
  }, 30_000);

  it("reports page count, document info, outline and page sizes", async () => {
    const inspected = await extractor.inspect(context("multipage-outline.pdf"));
    expect(inspected.metadata).toMatchObject({
      pageCount: 3,
      pdfVersion: "1.7",
      encrypted: false,
      documentInfo: { Title: "AnyFile PDF Sample", Author: "AnyFile Viewer", Keywords: "pdf, outline, sample" },
      pageSizes: ["595 x 842 pt", "842 x 595 pt"],
      sampledPages: 3,
      sampledPagesWithText: 3,
      outline: ["Chapter 1 Introduction", "Chapter 2 Results", "Appendix Landscape Table"],
    });
    expect(inspected.targets.map((target) => target.id)).toEqual(["page:1", "page:2", "page:3"]);
  }, 30_000);

  it("reads page text line by line in reading order", async () => {
    const page = await extractor.read(context("multipage-outline.pdf"), { target: "page:2", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(page.content).toBe([
      "## Page 2",
      "",
      "Chapter 2 Results",
      "Second page body text with keyword Lighthouse.",
      "Left column Right column",
    ].join("\n"));

    const doc = await extractor.read(context("multipage-outline.pdf"), { maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(doc.content.startsWith("# AnyFile PDF Sample\n")).toBe(true);
    expect(doc.content).toContain("Name Value\nalpha 42");

    const demo = await extractor.read(context("demo.pdf"), { target: "page:1", maxBytes: DEFAULT_READ_MAX_BYTES });
    expect(demo.content).toContain("afafafafsf");
  }, 30_000);

  it("maps password-protected PDFs to encrypted-file", async () => {
    await expect(extractor.inspect(context("encrypted-password.pdf"))).rejects.toMatchObject({ code: "encrypted-file" });
  }, 30_000);
});
