import { mindMapManifest } from "@anyfile/mind-map-viewer/manifest";
import { ifcManifest } from "@anyfile/ifc-viewer/manifest";
import { visioManifest } from "@anyfile/visio-viewer/manifest";
import { mppManifest } from "@anyfile/mpp-viewer/manifest";
import { dicomManifest } from "@anyfile/dicom-viewer/manifest";
import { dwgManifest } from "@anyfile/cad-dwg-viewer/manifest";
import { comicBookManifest } from "@anyfile/comic-book-reader/manifest";
import { mobiManifest } from "@anyfile/mobi-reader/manifest";
import { fictionBookManifest } from "@anyfile/fictionbook-reader/manifest";
import { epubManifest } from "@anyfile/epub-reader/manifest";
import { chmManifest } from "@anyfile/chm-reader/manifest";
import { djvuManifest } from "@anyfile/djvu-reader/manifest";
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
import { duckdbManifest } from "@anyfile/duckdb-viewer/manifest";
import { devArrayManifest } from "@anyfile/dev-array-viewer/manifest";
import { devNativeBinaryManifest } from "@anyfile/dev-native-binary-viewer/manifest";
import { devSourceMapManifest } from "@anyfile/dev-source-map-viewer/manifest";
import { devWasmManifest } from "@anyfile/dev-wasm-viewer/manifest";
import { djiOsmoManifest } from "@anyfile/dji-osmo-viewer/manifest";
import { excelManifest } from "@anyfile/excel-viewer/manifest";
import { generalRasterManifest } from "@anyfile/general-raster-viewer/manifest";
import { hdrImageManifest } from "@anyfile/hdr-image-viewer/manifest";
import { goProMaxManifest } from "@anyfile/gopro-max-viewer/manifest";
import { harManifest } from "@anyfile/har-viewer/manifest";
import { bittorrentManifest } from "@anyfile/bittorrent-viewer/manifest";
import { mlWeightsManifest } from "@anyfile/ml-weights-viewer/manifest";
import { plistManifest } from "@anyfile/plist-viewer/manifest";
import { pstManifest } from "@anyfile/pst-viewer/manifest";
import { certificateManifest } from "@anyfile/x509-certificate-viewer/manifest";
import { calendarContactsManifest } from "@anyfile/calendar-contacts-viewer/manifest";
import { hexManifest } from "@anyfile/hex-viewer/manifest";
import { insta360Manifest } from "@anyfile/insta360-viewer/manifest";
import { modernRasterManifest } from "@anyfile/modern-raster-viewer/manifest";
import { nonNativeAudioManifest } from "@anyfile/non-native-audio-viewer/manifest";
import { nonNativeVideoManifest } from "@anyfile/non-native-video-viewer/manifest";
import { pdfManifest } from "@anyfile/pdf-viewer/manifest";
import { photoshopManifest } from "@anyfile/photoshop-viewer/manifest";
import { iworkManifest } from "@anyfile/iwork-viewer/manifest";
import { pixelmatorPxdManifest } from "@anyfile/pixelmator-pxd-viewer/manifest";
import { postscriptManifest } from "@anyfile/postscript-viewer/manifest";
import { xpsManifest } from "@anyfile/xps-viewer/manifest";
import { ofdManifest } from "@anyfile/ofd-viewer/manifest";
import { powerpointManifest } from "@anyfile/powerpoint-viewer/manifest";
import { legacyOfficeManifest } from "@anyfile/legacy-office-viewer/manifest";
import { fontManifest } from "@anyfile/font-viewer/manifest";
import { safeSvgManifest } from "@anyfile/safe-svg-viewer/manifest";
import { scientificDataManifest } from "@anyfile/scientific-data-viewer/manifest";
import { sqliteManifest } from "@anyfile/sqlite-viewer/manifest";
import { statDataManifest } from "@anyfile/stat-data-viewer/manifest";
import { wordManifest } from "@anyfile/word-viewer/manifest";
import type { ViewerPluginManifest } from "@anyfile/viewer-protocol";

// Manifest-only inventory. This module must never import registrations, probes or plugin roots.
export const viewerManifests: readonly ViewerPluginManifest[] = [
  ifcManifest, dicomManifest,
  mindMapManifest,
  visioManifest, djiOsmoManifest, goProMaxManifest, insta360Manifest, browserVideoManifest, nonNativeVideoManifest, browserAudioManifest, nonNativeAudioManifest,
  browserImageManifest, modernRasterManifest, cameraRawManifest, generalRasterManifest, hdrImageManifest, pixelmatorPxdManifest,
  dwgManifest, cadExchangeManifest, pointCloudManifest, print3dManifest, mesh3dManifest, safeSvgManifest, fontManifest, photoshopManifest, cad2dManifest, pdfManifest, postscriptManifest, xpsManifest, ofdManifest, wordManifest, excelManifest, powerpointManifest, iworkManifest, legacyOfficeManifest, mppManifest, harManifest, bittorrentManifest, mlWeightsManifest, certificateManifest, calendarContactsManifest, pstManifest, plistManifest,
  codeManifest, sqliteManifest, statDataManifest, scientificDataManifest, devArrayManifest, devWasmManifest, devSourceMapManifest, devNativeBinaryManifest,
  comicBookManifest, mobiManifest, fictionBookManifest, epubManifest, chmManifest, djvuManifest, duckdbManifest, archiveMetadataManifest, hexManifest,
];

export function manifestsForExtension(extension: string) {
  const normalized = `.${extension.toLowerCase()}`;
  return viewerManifests.filter((manifest) =>
    manifest.formats.some((format) => format.extensions.includes(normalized)),
  );
}
