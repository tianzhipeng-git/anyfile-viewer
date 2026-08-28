import { describe, expect, it } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";
import { modernRasterManifest } from "./manifest";

describe("modern raster manifest", () => {
  it("is protocol compliant", () => {
    expect(() => validateManifest(modernRasterManifest)).not.toThrow();
    expect(modernRasterManifest.formats.flatMap((format) => format.extensions)).toEqual([".jxl", ".heic", ".heif", ".heifs", ".hif"]);
  });
});
