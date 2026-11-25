import { browserImageManifest } from "@anyfile/browser-image-viewer/manifest";
import { cameraRawManifest } from "@anyfile/camera-raw-viewer/manifest";
import { dicomManifest } from "@anyfile/dicom-viewer/manifest";
import { fontManifest } from "@anyfile/font-viewer/manifest";
import { generalRasterManifest } from "@anyfile/general-raster-viewer/manifest";
import { hdrImageManifest } from "@anyfile/hdr-image-viewer/manifest";
import { modernRasterManifest } from "@anyfile/modern-raster-viewer/manifest";
import { photoshopManifest } from "@anyfile/photoshop-viewer/manifest";
import { pixelmatorPxdManifest } from "@anyfile/pixelmator-pxd-viewer/manifest";
import { safeSvgManifest } from "@anyfile/safe-svg-viewer/manifest";
import type { ViewerPluginRegistration } from "@anyfile/viewer-protocol";

export const imageRegistrations: readonly ViewerPluginRegistration[] = [
  {
    manifest: dicomManifest,
    async probe(context) { return (await import("@anyfile/dicom-viewer/probe")).probeDicom(context); },
    async load() { return (await import("@anyfile/dicom-viewer")).dicomViewer; },
  },
  {
    manifest: fontManifest,
    async probe(context) { return (await import("@anyfile/font-viewer/probe")).probeFont(context); },
    async load() { return (await import("@anyfile/font-viewer")).fontViewer; },
  },
  {
    manifest: browserImageManifest,
    async probe(context) { return (await import("@anyfile/browser-image-viewer/probe")).probeBrowserImage(context); },
    async load() { return (await import("@anyfile/browser-image-viewer")).browserImageViewer; },
  },
  {
    manifest: modernRasterManifest,
    async probe(context) { return (await import("@anyfile/modern-raster-viewer/probe")).probeModernRaster(context); },
    async load() { return (await import("@anyfile/modern-raster-viewer")).modernRasterViewer; },
  },
  {
    manifest: cameraRawManifest,
    async probe(context) { return (await import("@anyfile/camera-raw-viewer/probe")).probeCameraRaw(context); },
    async load() { return (await import("@anyfile/camera-raw-viewer")).cameraRawViewer; },
  },
  {
    manifest: generalRasterManifest,
    async probe(context) { return (await import("@anyfile/general-raster-viewer/probe")).probeGeneralRaster(context); },
    async load() { return (await import("@anyfile/general-raster-viewer")).generalRasterViewer; },
  },
  {
    manifest: hdrImageManifest,
    async probe(context) { return (await import("@anyfile/hdr-image-viewer/probe")).probeHdrImage(context); },
    async load() { return (await import("@anyfile/hdr-image-viewer")).hdrImageViewer; },
  },
  {
    manifest: pixelmatorPxdManifest,
    async probe(context) { return (await import("@anyfile/pixelmator-pxd-viewer/probe")).probePixelmatorPxd(context); },
    async load() { return (await import("@anyfile/pixelmator-pxd-viewer")).pixelmatorPxdViewer; },
  },
  {
    manifest: safeSvgManifest,
    async probe(context) { return (await import("@anyfile/safe-svg-viewer/probe")).probeSafeSvg(context); },
    async load() { return (await import("@anyfile/safe-svg-viewer")).safeSvgViewer; },
  },
  {
    manifest: photoshopManifest,
    async probe(context) { return (await import("@anyfile/photoshop-viewer/probe")).probePhotoshop(context); },
    async load() { return (await import("@anyfile/photoshop-viewer")).photoshopViewer; },
  },
];
