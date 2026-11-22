import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findViewerRegistrations, resolveViewerRegistrations } from "@anyfile/viewer-protocol";
import { viewerRegistrations } from "../viewer-registrations";

describe("publication routing", () => {
  it.each([
    ["epub3.epub", "epub-reader"],
    ["pages.cbz", "comic-book-reader"],
    ["normal.fb2.zip", "fictionbook-reader"],
    ["single-fb2.zip", "fictionbook-reader"],
  ])("prefers the book reader while retaining archive inspection for %s", async (name, id) => {
    const file = new File([readFileSync(join(process.cwd(), "docs/ebooks/fixtures", name))], name);
    const result = await resolveViewerRegistrations(file, viewerRegistrations, { signal: new AbortController().signal });
    expect(result.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([[id, 4], ["archive-metadata-viewer", 2], ["hex-viewer", 1]]);
  });

  it.each(["rar4.cbr", "rar5.cbr", "pages.cbt"])("keeps the archive alternative for %s", async (name) => {
    const file = new File([readFileSync(join(process.cwd(), "docs/ebooks/fixtures/phase45", name))], name);
    const result = await resolveViewerRegistrations(file, viewerRegistrations, { signal: new AbortController().signal });
    expect(result.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["comic-book-reader", 4], ["archive-metadata-viewer", 2], ["hex-viewer", 1]]);
  });

  it("routes valid DjVu books and rejects invalid DjVu headers", async () => {
    const djvuBytes = readFileSync(join(process.cwd(), "viewer/plugins/djvu/examples/djvu3spec.djvu"));
    const djvu = await resolveViewerRegistrations(
      new File([djvuBytes], "spec.djvu"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(djvu.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["djvu-reader", 4], ["hex-viewer", 1]]);

    const invalidDjvu = await resolveViewerRegistrations(
      new File(["not a djvu"], "broken.djvu"),
      viewerRegistrations,
      { signal: new AbortController().signal },
    );
    expect(invalidDjvu.map(({ registration }) => registration.manifest.id)).toEqual(["hex-viewer"]);
  });

  it("orders publication candidates ahead of hex fallback", () => {
    expect(findViewerRegistrations("manual.chm", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["chm-reader", "hex-viewer"]);
  });
});
