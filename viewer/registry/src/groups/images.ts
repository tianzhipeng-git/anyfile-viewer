import { browserImageManifest } from "@anyfile/browser-image-viewer/manifest";
import { cameraRawManifest } from "@anyfile/camera-raw-viewer/manifest";
import { designSourceManifest } from "@anyfile/design-source-viewer/manifest";
import { dicomManifest } from "@anyfile/dicom-viewer/manifest";
import { fontManifest } from "@anyfile/font-viewer/manifest";
import { generalRasterManifest } from "@anyfile/general-raster-viewer/manifest";
import { hdrImageManifest } from "@anyfile/hdr-image-viewer/manifest";
import { modernRasterManifest } from "@anyfile/modern-raster-viewer/manifest";
import { photoshopManifest } from "@anyfile/photoshop-viewer/manifest";
import { pixelmatorPxdManifest } from "@anyfile/pixelmator-pxd-viewer/manifest";
import { safeSvgManifest } from "@anyfile/safe-svg-viewer/manifest";
import type { ViewerRegistryEntry } from "@anyfile/viewer-protocol";

export const imageRegistryEntries: readonly ViewerRegistryEntry[] = [
  {
    manifest: dicomManifest,
    async probe(context) { return (await import("@anyfile/dicom-viewer/probe")).probeDicom(context); },
  },
  {
    manifest: fontManifest,
    async probe(context) { return (await import("@anyfile/font-viewer/probe")).probeFont(context); },
  },
  {
    manifest: browserImageManifest,
    async probe(context) { return (await import("@anyfile/browser-image-viewer/probe")).probeBrowserImage(context); },
  },
  {
    manifest: modernRasterManifest,
    async probe(context) { return (await import("@anyfile/modern-raster-viewer/probe")).probeModernRaster(context); },
  },
  {
    manifest: cameraRawManifest,
    async probe(context) { return (await import("@anyfile/camera-raw-viewer/probe")).probeCameraRaw(context); },
  },
  {
    manifest: generalRasterManifest,
    async probe(context) { return (await import("@anyfile/general-raster-viewer/probe")).probeGeneralRaster(context); },
  },
  {
    manifest: hdrImageManifest,
    async probe(context) { return (await import("@anyfile/hdr-image-viewer/probe")).probeHdrImage(context); },
  },
  {
    manifest: pixelmatorPxdManifest,
    async probe(context) { return (await import("@anyfile/pixelmator-pxd-viewer/probe")).probePixelmatorPxd(context); },
  },
  {
    manifest: safeSvgManifest,
    async probe(context) { return (await import("@anyfile/safe-svg-viewer/probe")).probeSafeSvg(context); },
  },
  {
    manifest: photoshopManifest,
    async probe(context) { return (await import("@anyfile/photoshop-viewer/probe")).probePhotoshop(context); },
  },
  {
    manifest: designSourceManifest,
    async probe(context) { return (await import("@anyfile/design-source-viewer/probe")).probeDesignSource(context); },
  },
];
