import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findViewerRegistrations, resolveViewerRegistrations } from "@anyfile/viewer-protocol";
import { viewerRegistrations } from "../viewer-registrations";

describe("image and font routing", () => {
  it("routes native DICOM images before Hex and keeps metadata-only variants inspectable", async () => {
    for (const [name, level] of [["synthetic-multiframe.dcm", 3], ["synthetic-metadata-only.dcm", 1]] as const) {
      const file = new File([readFileSync(join(process.cwd(), "viewer/plugins/dicom/examples", name))], name.toUpperCase());
      const result = await resolveViewerRegistrations(file, viewerRegistrations, { signal: new AbortController().signal });
      expect(result.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
        .toEqual([["dicom", level], ["hex-viewer", 1]]);
    }
    const invalid = await resolveViewerRegistrations(new File(["not a DICOM file"], "bad.dcm"), viewerRegistrations, { signal: new AbortController().signal });
    expect(invalid.map(({ registration }) => registration.manifest.id)).toEqual(["hex-viewer"]);
  });

  it("orders raster, RAW, SVG and font candidates consistently", () => {
    for (const extension of ["ttf", "otf", "woff", "woff2"]) {
      expect(findViewerRegistrations(`brand.${extension}`, viewerRegistrations).map(({ manifest }) => manifest.id))
        .toEqual(["font-viewer", "hex-viewer"]);
    }
    expect(findViewerRegistrations("photo.avif", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["browser-image", "hex-viewer"]);
    expect(findViewerRegistrations("photo.jpg", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["dji-osmo", "gopro-max", "browser-image", "hex-viewer"]);
    expect(findViewerRegistrations("photo.jxl", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.heic", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.heif", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["browser-image", "modern-raster", "hex-viewer"]);
    expect(findViewerRegistrations("photo.dng", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["insta360", "camera-raw", "hex-viewer"]);
    expect(findViewerRegistrations("photo.rw2", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["camera-raw", "hex-viewer"]);
    for (const extension of ["nrw", "sr2", "srf", "orf", "pef"]) {
      expect(findViewerRegistrations(`photo.${extension}`, viewerRegistrations).map(({ manifest }) => manifest.id))
        .toEqual(["camera-raw", "hex-viewer"]);
    }
    expect(findViewerRegistrations("scan.tiff", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("scan.tf8", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("slide.ome.tiff", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("map.geotiff", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("texture.vst", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["general-raster", "hex-viewer"]);
    expect(findViewerRegistrations("vector.svg", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["safe-svg", "ace-code-text", "hex-viewer"]);
    expect(findViewerRegistrations("vector.svgz", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["safe-svg", "hex-viewer"]);
  });
});
