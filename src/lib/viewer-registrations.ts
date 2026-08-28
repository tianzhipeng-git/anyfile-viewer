import { archiveMetadataManifest } from "@anyfile/archive-metadata-viewer/manifest";
import { codeManifest } from "@anyfile/code-viewer/manifest";
import { dataManifest } from "@anyfile/data-viewer/manifest";
import { excelManifest } from "@anyfile/excel-viewer/manifest";
import { hexManifest } from "@anyfile/hex-viewer/manifest";
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
    manifest: pdfManifest,
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
