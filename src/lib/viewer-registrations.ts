import { archiveMetadataManifest } from "@anyfile/archive-metadata-viewer/manifest";
import { browserAudioManifest } from "@anyfile/browser-audio-viewer/manifest";
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
import { browserImageManifest } from "@anyfile/browser-image-viewer/manifest";
import { modernRasterManifest } from "@anyfile/modern-raster-viewer/manifest";
import { nonNativeVideoManifest } from "@anyfile/non-native-video-viewer/manifest";
import { nonNativeAudioManifest } from "@anyfile/non-native-audio-viewer/manifest";
import { pdfManifest } from "@anyfile/pdf-viewer/manifest";
import { postscriptManifest } from "@anyfile/postscript-viewer/manifest";
import { photoshopManifest } from "@anyfile/photoshop-viewer/manifest";
import { powerpointManifest } from "@anyfile/powerpoint-viewer/manifest";
import { safeSvgManifest } from "@anyfile/safe-svg-viewer/manifest";
import { sqliteManifest } from "@anyfile/sqlite-viewer/manifest";
import { wordManifest } from "@anyfile/word-viewer/manifest";
import {
  validateRegistrations,
  type ViewerPluginRegistration,
} from "@anyfile/viewer-protocol";

export const viewerRegistrations: readonly ViewerPluginRegistration[] = [
  {
    manifest: djiOsmoManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/dji-osmo-viewer/probe");
      return probePackage.probeDjiOsmo(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/dji-osmo-viewer");
      return viewerPackage.djiOsmoViewer;
    },
  },
  {
    manifest: goProMaxManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/gopro-max-viewer/probe");
      return probePackage.probeGoProMax(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/gopro-max-viewer");
      return viewerPackage.goProMaxViewer;
    },
  },
  {
    manifest: insta360Manifest,
    async probe(context) {
      const probePackage = await import("@anyfile/insta360-viewer/probe");
      return probePackage.probeInsta360(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/insta360-viewer");
      return viewerPackage.insta360Viewer;
    },
  },
  {
    manifest: browserVideoManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/browser-video-viewer/probe");
      return probePackage.probeBrowserVideo(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/browser-video-viewer");
      return viewerPackage.browserVideoViewer;
    },
  },
  {
    manifest: nonNativeVideoManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/non-native-video-viewer/probe");
      return probePackage.probeNonNativeVideo(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/non-native-video-viewer");
      return viewerPackage.nonNativeVideoViewer;
    },
  },
  {
    manifest: browserAudioManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/browser-audio-viewer/probe");
      return probePackage.probeBrowserAudio(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/browser-audio-viewer");
      return viewerPackage.browserAudioViewer;
    },
  },
  {
    manifest: nonNativeAudioManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/non-native-audio-viewer/probe");
      return probePackage.probeNonNativeAudio(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/non-native-audio-viewer");
      return viewerPackage.nonNativeAudioViewer;
    },
  },
  {
    manifest: browserImageManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/browser-image-viewer/probe");
      return probePackage.probeBrowserImage(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/browser-image-viewer");
      return viewerPackage.browserImageViewer;
    },
  },
  {
    manifest: modernRasterManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/modern-raster-viewer/probe");
      return probePackage.probeModernRaster(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/modern-raster-viewer");
      return viewerPackage.modernRasterViewer;
    },
  },
  {
    manifest: cameraRawManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/camera-raw-viewer/probe");
      return probePackage.probeCameraRaw(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/camera-raw-viewer");
      return viewerPackage.cameraRawViewer;
    },
  },
  {
    manifest: generalRasterManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/general-raster-viewer/probe");
      return probePackage.probeGeneralRaster(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/general-raster-viewer");
      return viewerPackage.generalRasterViewer;
    },
  },
  {
    manifest: safeSvgManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/safe-svg-viewer/probe");
      return probePackage.probeSafeSvg(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/safe-svg-viewer");
      return viewerPackage.safeSvgViewer;
    },
  },
  {
    manifest: photoshopManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/photoshop-viewer/probe");
      return probePackage.probePhotoshop(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/photoshop-viewer");
      return viewerPackage.photoshopViewer;
    },
  },
  {
    manifest: pdfManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/pdf-viewer/probe");
      return probePackage.probePdf(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/pdf-viewer");
      return viewerPackage.pdfViewer;
    },
  },
  {
    manifest: postscriptManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/postscript-viewer/probe");
      return probePackage.probePostscript(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/postscript-viewer");
      return viewerPackage.postscriptViewer;
    },
  },
  {
    manifest: wordManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/word-viewer/probe");
      return probePackage.probeWordDocument(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/word-viewer");
      return viewerPackage.wordViewer;
    },
  },
  {
    manifest: excelManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/excel-viewer/probe");
      return probePackage.probeExcelWorkbook(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/excel-viewer");
      return viewerPackage.excelViewer;
    },
  },
  {
    manifest: powerpointManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/powerpoint-viewer/probe");
      return probePackage.probePowerPointPresentation(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/powerpoint-viewer");
      return viewerPackage.powerpointViewer;
    },
  },
  {
    manifest: harManifest,
    async load() {
      const viewerPackage = await import("@anyfile/har-viewer");
      return viewerPackage.harViewer;
    },
  },
  {
    manifest: codeManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/code-viewer/probe");
      return probePackage.probeCode(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/code-viewer");
      return viewerPackage.codeViewer;
    },
  },
  {
    manifest: sqliteManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/sqlite-viewer/probe");
      return probePackage.probeSQLite(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/sqlite-viewer");
      return viewerPackage.sqliteViewer;
    },
  },
  {
    manifest: devArrayManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/dev-array-viewer/probe");
      return probePackage.probeDevArray(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/dev-array-viewer");
      return viewerPackage.devArrayViewer;
    },
  },
  {
    manifest: devWasmManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/dev-wasm-viewer/probe");
      return probePackage.probeDevWasm(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/dev-wasm-viewer");
      return viewerPackage.devWasmViewer;
    },
  },
  {
    manifest: devSourceMapManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/dev-source-map-viewer/probe");
      return probePackage.probeDevSourceMap(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/dev-source-map-viewer");
      return viewerPackage.devSourceMapViewer;
    },
  },
  {
    manifest: dataManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/data-viewer/probe");
      return probePackage.probeData(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/data-viewer");
      return viewerPackage.dataViewer;
    },
  },
  {
    manifest: archiveMetadataManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/archive-metadata-viewer/probe");
      return probePackage.probeArchive(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/archive-metadata-viewer");
      return viewerPackage.archiveMetadataViewer;
    },
  },
  {
    manifest: cad2dManifest,
    async probe(context) {
      const probePackage = await import("@anyfile/cad-2d-viewer/probe");
      return probePackage.probeCad2d(context);
    },
    async load() {
      const viewerPackage = await import("@anyfile/cad-2d-viewer");
      return viewerPackage.cad2dViewer;
    },
  },
  {
    manifest: hexManifest,
    async load() {
      const viewerPackage = await import("@anyfile/hex-viewer");
      return viewerPackage.hexViewer;
    },
  },
];

validateRegistrations(viewerRegistrations);
