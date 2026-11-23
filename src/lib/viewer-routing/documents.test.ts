import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findViewerRegistrations, resolveViewerRegistrations } from "@anyfile/viewer-protocol";
import { viewerRegistrations } from "../viewer-registrations";

describe("document and office routing", () => {
  it("routes FreeMind ahead of text while retaining Objective-C++ support", async () => {
    const signal = new AbortController().signal;
    const mindMap = await resolveViewerRegistrations(new File(['<?xml version="1.0"?><map><node TEXT="Plan"/></map>'], "ideas.mm"), viewerRegistrations, { signal });
    expect(mindMap[0].registration.manifest.id).toBe("mind-map");
    const source = await resolveViewerRegistrations(new File(["#import <Foundation/Foundation.h>"], "source.mm"), viewerRegistrations, { signal });
    expect(source[0].registration.manifest.id).toBe("ace-code-text");
    expect(source.some(({ registration }) => registration.manifest.id === "mind-map")).toBe(false);
  });

  it("distinguishes PDF, PDF-compatible AI, and legacy PostScript artwork", async () => {
    const invalidPdf = await resolveViewerRegistrations(
      new File(["not a pdf"], "document.pdf"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(invalidPdf.map(({ registration }) => registration.manifest.id)).toEqual(["hex-viewer"]);

    const modernIllustrator = await resolveViewerRegistrations(
      new File(["%PDF-1.7\n% Illustrator data"], "artwork.ai"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(modernIllustrator.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["pdfjs-pdf", 4], ["hex-viewer", 1]]);

    const legacyIllustrator = await resolveViewerRegistrations(
      new File(["%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: Adobe Illustrator\n"], "artwork.ai"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(legacyIllustrator.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["postscript-document", 3], ["hex-viewer", 1]]);

    const epsi = await resolveViewerRegistrations(
      new File(["%!PS-Adobe-3.0 EPSF-3.0\n"], "artwork.epsi"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(epsi.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["postscript-document", 3], ["hex-viewer", 1]]);
  });

  it("prefers Office viewers over archive inspection for ZIP-based documents", async () => {
    const officeBytes = readFileSync(join(process.cwd(), "viewer/plugins/archive/examples/archive.zip"));
    for (const [name, expected, level] of [
      ["document.docx", "word-document", 4],
      ["workbook.xlsx", "excel-workbook", 3],
      ["workbook.ods", "excel-workbook", 3],
      ["slides.pptx", "powerpoint-presentation", 4],
    ] as const) {
      const resolved = await resolveViewerRegistrations(
        new File([officeBytes], name), viewerRegistrations,
        { signal: new AbortController().signal },
      );
      expect(resolved.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
        .toEqual([[expected, level], ["archive-metadata-viewer", 2], ["hex-viewer", 1]]);
    }
  });

  it("routes iWork packages by content: IWA Pages/Keynote ahead of archive inspection, PEM keys away", async () => {
    const signal = new AbortController().signal;
    const pages = readFileSync(join(process.cwd(), "viewer/plugins/iwork/examples/testPages2013.pages"));
    const resolved = await resolveViewerRegistrations(new File([pages], "letter.pages"), viewerRegistrations, { signal });
    expect(resolved.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["iwork", 3], ["hex-viewer", 1]]);
    const pem = await resolveViewerRegistrations(new File(["-----BEGIN PRIVATE KEY-----\n"], "server.key"), viewerRegistrations, { signal });
    expect(pem.map(({ registration }) => registration.manifest.id)).toEqual(["hex-viewer"]);
  });

  it("routes XPS and OpenXPS packages by FixedPage content", async () => {
    const signal = new AbortController().signal;
    const xps = readFileSync(join(process.cwd(), "viewer/plugins/xps/examples/testPPT.xps"));
    for (const name of ["slides.xps", "slides.oxps"]) {
      const resolved = await resolveViewerRegistrations(new File([xps], name), viewerRegistrations, { signal });
      expect(resolved.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
        .toEqual([["xps-reader", 4], ["hex-viewer", 1]]);
    }
    const docx = await resolveViewerRegistrations(new File(["PK\u0003\u0004"], "disguised.xps"), viewerRegistrations, { signal });
    expect(docx.map(({ registration }) => registration.manifest.id)).toEqual(["hex-viewer"]);
  });

  it.each(["records.csv", "records.tsv"])("routes %s to main-content table viewers", async (name) => {
    const resolved = await resolveViewerRegistrations(
      new File(["name,value\nAlice,42\n"], name), viewerRegistrations,
      { signal: new AbortController().signal },
    );
    const tables = resolved.filter(({ registration }) =>
      ["excel-workbook", "duckdb-data"].includes(registration.manifest.id),
    );
    expect(tables.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["excel-workbook", 3], ["duckdb-data", 3]]);
    expect(resolved[0].registration.manifest.id).toBe("excel-workbook");
  });

  it("orders document, office and calendar candidates ahead of archive and hex fallbacks", () => {
    expect(findViewerRegistrations("report.docx", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["word-document", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("legacy.doc", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["legacy-office", "hex-viewer"]);
    expect(findViewerRegistrations("notes.rtf", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["legacy-office", "hex-viewer"]);
    expect(findViewerRegistrations("slides.pptx", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["powerpoint-presentation", "archive-metadata-viewer", "hex-viewer"]);
    expect(findViewerRegistrations("deck.ppt", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["legacy-office", "hex-viewer"]);
    expect(findViewerRegistrations("book.xlsx", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["excel-workbook", "archive-metadata-viewer", "hex-viewer"]);
    for (const extension of ["ics", "vcf"]) {
      expect(findViewerRegistrations(`invite.${extension}`, viewerRegistrations).map(({ manifest }) => manifest.id))
        .toEqual(["calendar-contacts", "hex-viewer"]);
    }
  });
});
