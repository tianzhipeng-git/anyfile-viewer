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
    expect(findViewerRegistrations("render.exr", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["hdr-image", "hex-viewer"]);
    expect(findViewerRegistrations("studio.hdr", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["hdr-image", "hex-viewer"]);
    expect(findViewerRegistrations("sky.rgbe", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["hdr-image", "hex-viewer"]);
    expect(findViewerRegistrations("handoff.fig", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["design-source", "hex-viewer"]);
    expect(findViewerRegistrations("screens.sketch", viewerRegistrations).map(({ manifest }) => manifest.id))
      .toEqual(["design-source", "hex-viewer"]);
  });

  it("routes valid OpenEXR and Radiance HDR files to hdr-image and falls back to hex when disguised", async () => {
    const exr = new File([readFileSync(join(process.cwd(), "viewer/plugins/hdr-image/examples/all-half-values.exr"))], "scene.exr");
    const exrResolved = await resolveViewerRegistrations(exr, viewerRegistrations, { signal: new AbortController().signal });
    expect(exrResolved.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["hdr-image", 4], ["hex-viewer", 1]]);

    const hdr = new File([readFileSync(join(process.cwd(), "viewer/plugins/hdr-image/examples/studio-gradient.hdr"))], "env.hdr");
    const hdrResolved = await resolveViewerRegistrations(hdr, viewerRegistrations, { signal: new AbortController().signal });
    expect(hdrResolved.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["hdr-image", 4], ["hex-viewer", 1]]);

    const bad = await resolveViewerRegistrations(new File(["not an exr"], "disguised.exr"), viewerRegistrations, { signal: new AbortController().signal });
    expect(bad.map(({ registration }) => registration.manifest.id)).toEqual(["hex-viewer"]);
  });

  it("routes valid Figma .fig and Sketch .sketch files to design-source and falls back to hex when disguised", async () => {
    const fig = new File([readFileSync(join(process.cwd(), "viewer/plugins/design-source/examples/OpenFigs.fig"))], "handoff.fig");
    const figResolved = await resolveViewerRegistrations(fig, viewerRegistrations, { signal: new AbortController().signal });
    expect(figResolved.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["design-source", 3], ["hex-viewer", 1]]);

    const sketch = new File([readFileSync(join(process.cwd(), "viewer/plugins/design-source/examples/artboard-backgrounds.sketch"))], "screens.sketch");
    const sketchResolved = await resolveViewerRegistrations(sketch, viewerRegistrations, { signal: new AbortController().signal });
    expect(sketchResolved.map(({ registration, supportLevel }) => [registration.manifest.id, supportLevel]))
      .toEqual([["design-source", 3], ["hex-viewer", 1]]);

    const badFig = await resolveViewerRegistrations(new File(["not a fig"], "disguised.fig"), viewerRegistrations, { signal: new AbortController().signal });
    expect(badFig.map(({ registration }) => registration.manifest.id)).toEqual(["hex-viewer"]);
  });
});
