import { describe, expect, it } from "vitest";
import { validateManifest } from "@anyfile/viewer-protocol";

import { generalRasterManifest } from "./manifest";

describe("general raster manifest", () => {
  it("is protocol compliant and declares the stage 2 extensions", () => {
    expect(() => validateManifest(generalRasterManifest)).not.toThrow();
    expect(generalRasterManifest.formats.flatMap(({ extensions }) => extensions)).toEqual([
      ".tga", ".icb", ".vda", ".vst",
      ".pnm", ".pbm", ".pgm", ".ppm", ".pam",
      ".tif", ".tiff", ".tf8", ".btf", ".btiff", ".ptif", ".ptiff",
      ".gtif", ".gtiff", ".geotif", ".geotiff",
      ".ome.tif", ".ome.tiff", ".ome.tf2", ".ome.tf8", ".ome.btf",
    ]);
  });
});
