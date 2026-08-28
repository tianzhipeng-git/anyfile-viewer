import { archiveMetadataManifest } from "@anyfile/archive-metadata-viewer/manifest";
import { cameraRawManifest } from "@anyfile/camera-raw-viewer/manifest";
import { codeManifest } from "@anyfile/code-viewer/manifest";
import { dataManifest } from "@anyfile/data-viewer/manifest";
import { excelManifest } from "@anyfile/excel-viewer/manifest";
import { generalRasterManifest } from "@anyfile/general-raster-viewer/manifest";
import { hexManifest } from "@anyfile/hex-viewer/manifest";
import { browserImageManifest } from "@anyfile/browser-image-viewer/manifest";
import { modernRasterManifest } from "@anyfile/modern-raster-viewer/manifest";
import { pdfManifest } from "@anyfile/pdf-viewer/manifest";
import { powerpointManifest } from "@anyfile/powerpoint-viewer/manifest";
import { sqliteManifest } from "@anyfile/sqlite-viewer/manifest";
import { wordManifest } from "@anyfile/word-viewer/manifest";
import {
  validateRegistrations,
  type ViewerPluginRegistration,
} from "@anyfile/viewer-protocol";

export const viewerRegistrations: readonly ViewerPluginRegistration[] = [
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
    manifest: wordManifest,
    async load() {
      const viewerPackage = await import("@anyfile/word-viewer");
      return viewerPackage.wordViewer;
    },
  },
  {
    manifest: excelManifest,
    async load() {
      const viewerPackage = await import("@anyfile/excel-viewer");
      return viewerPackage.excelViewer;
    },
  },
  {
    manifest: powerpointManifest,
    async load() {
      const viewerPackage = await import("@anyfile/powerpoint-viewer");
      return viewerPackage.powerpointViewer;
    },
  },
  {
    manifest: codeManifest,
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
    manifest: dataManifest,
    async load() {
      const viewerPackage = await import("@anyfile/data-viewer");
      return viewerPackage.dataViewer;
    },
  },
  {
    manifest: archiveMetadataManifest,
    async load() {
      const viewerPackage = await import("@anyfile/archive-metadata-viewer");
      return viewerPackage.archiveMetadataViewer;
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
