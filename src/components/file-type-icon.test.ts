import { describe, expect, it } from "vitest";

import { viewerRegistrations } from "../lib/viewer-registrations";

import { getFileTypeKind } from "./file-type-icon";

describe("getFileTypeKind", () => {
  it.each([
    ["photo.HEIC", "image"],
    ["panorama.insp", "image"],
    ["panorama.360", "video"],
    ["panorama.osv", "video"],
    ["proxy.lrv", "video"],
    ["clip.webm", "video"],
    ["movie.mkv", "video"],
    ["recording.flac", "audio"],
    ["report.docx", "document"],
    ["slides.pptx", "presentation"],
    ["workbook.xlsx", "spreadsheet"],
    ["source.tsx", "code"],
    ["source.ts", "code"],
    ["capture.m2ts", "video"],
    ["records.parquet", "database"],
    ["scene.gltf", "model"],
    ["layout.fig", "design"],
    ["artwork.ai", "design"],
    ["composition.psd", "design"],
    ["typeface.woff2", "font"],
    ["bundle.tar.gz", "archive"],
    ["module.wasm", "developer"],
    ["bundle.js.map", "developer"],
    ["matrix.npy", "developer"],
    ["unknown.anyfile", "unknown"],
  ] as const)("classifies %s as %s", (fileName, expectedKind) => {
    expect(getFileTypeKind(fileName)).toBe(expectedKind);
  });

  it("keeps compressed structured data in its semantic category", () => {
    expect(getFileTypeKind("records.csv.gz")).toBe("spreadsheet");
    expect(getFileTypeKind("events.jsonl.zst")).toBe("code");
  });

  it("recognizes extensionless and dotfile names", () => {
    expect(getFileTypeKind("Dockerfile")).toBe("code");
    expect(getFileTypeKind(".env")).toBe("code");
  });

  it("covers every explicitly registered viewer format", () => {
    const missingExtensions = viewerRegistrations.flatMap(({ manifest }) =>
      manifest.formats.flatMap(({ extensions }) =>
        extensions
          .filter((extension) => extension !== "*")
          .filter((extension) => getFileTypeKind(`sample${extension}`) === "unknown")
      )
    );

    expect(missingExtensions).toEqual([]);
  });
});
