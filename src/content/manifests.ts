import { fictionBookManifest } from "@anyfile/fictionbook-reader/manifest";
import { cadExchangeManifest } from "@anyfile/cad-exchange-viewer/manifest";
import { pointCloudManifest } from "@anyfile/point-cloud-viewer/manifest";
import { print3dManifest } from "@anyfile/print-3d-viewer/manifest";
import { mesh3dManifest } from "@anyfile/mesh-3d-viewer/manifest";
import { archiveMetadataManifest } from "@anyfile/archive-metadata-viewer/manifest";
import { browserAudioManifest } from "@anyfile/browser-audio-viewer/manifest";
import { browserImageManifest } from "@anyfile/browser-image-viewer/manifest";
import { browserVideoManifest } from "@anyfile/browser-video-viewer/manifest";
import { cad2dManifest } from "@anyfile/cad-2d-viewer/manifest";
import { cameraRawManifest } from "@anyfile/camera-raw-viewer/manifest";
import { codeManifest } from "@anyfile/code-viewer/manifest";
import { dataManifest } from "@anyfile/data-viewer/manifest";
import { devArrayManifest } from "@anyfile/dev-array-viewer/manifest";
import { devSourceMapManifest } from "@anyfile/dev-source-map-viewer/manifest";
import { devWasmManifest } from "@anyfile/dev-wasm-viewer/manifest";
import { djiOsmoManifest } from "@anyfile/dji-osmo-viewer/manifest";
import { excelManifest } from "@anyfile/excel-viewer/manifest";
import { generalRasterManifest } from "@anyfile/general-raster-viewer/manifest";
import { goProMaxManifest } from "@anyfile/gopro-max-viewer/manifest";
import { harManifest } from "@anyfile/har-viewer/manifest";
import { hexManifest } from "@anyfile/hex-viewer/manifest";
import { insta360Manifest } from "@anyfile/insta360-viewer/manifest";
import { modernRasterManifest } from "@anyfile/modern-raster-viewer/manifest";
import { nonNativeAudioManifest } from "@anyfile/non-native-audio-viewer/manifest";
import { nonNativeVideoManifest } from "@anyfile/non-native-video-viewer/manifest";
import { pdfManifest } from "@anyfile/pdf-viewer/manifest";
import { photoshopManifest } from "@anyfile/photoshop-viewer/manifest";
import { pixelmatorPxdManifest } from "@anyfile/pixelmator-pxd-viewer/manifest";
import { postscriptManifest } from "@anyfile/postscript-viewer/manifest";
import { powerpointManifest } from "@anyfile/powerpoint-viewer/manifest";
import { safeSvgManifest } from "@anyfile/safe-svg-viewer/manifest";
import { sqliteManifest } from "@anyfile/sqlite-viewer/manifest";
import { wordManifest } from "@anyfile/word-viewer/manifest";
import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";

// Manifest-only inventory. This module must never import registrations, probes or plugin roots.
export const viewerManifests: readonly ViewerPluginManifest[] = [
  djiOsmoManifest, goProMaxManifest, insta360Manifest, browserVideoManifest, nonNativeVideoManifest, browserAudioManifest, nonNativeAudioManifest,
  browserImageManifest, modernRasterManifest, cameraRawManifest, generalRasterManifest, pixelmatorPxdManifest,
  cadExchangeManifest, pointCloudManifest, print3dManifest, mesh3dManifest, safeSvgManifest, photoshopManifest, cad2dManifest, pdfManifest, postscriptManifest, wordManifest, excelManifest, powerpointManifest, harManifest,
  codeManifest, sqliteManifest, devArrayManifest, devWasmManifest, devSourceMapManifest,
  fictionBookManifest, dataManifest, archiveMetadataManifest, hexManifest,
];

export function manifestsForExtension(extension: string) {
  const normalized = `.${extension.toLowerCase()}`;
  return viewerManifests.filter((manifest) =>
    manifest.formats.some((format) => format.extensions.includes(normalized)),
  );
}
