import { codeManifest } from "@anyfile/code-viewer/manifest";
import { dataManifest } from "@anyfile/data-viewer/manifest";
import { excelManifest } from "@anyfile/excel-viewer/manifest";
import { pdfManifest } from "@anyfile/pdf-viewer/manifest";
import { sqliteManifest } from "@anyfile/sqlite-viewer/manifest";
import {
  validateRegistrations,
  type ViewerPluginRegistration,
} from "@anyfile/viewer-protocol";

export const viewerRegistrations: readonly ViewerPluginRegistration[] = [
  {
    manifest: dataManifest,
    async load() {
      const viewerPackage = await import("@anyfile/data-viewer");
      return viewerPackage.dataViewer;
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
    manifest: pdfManifest,
    async load() {
      const viewerPackage = await import("@anyfile/pdf-viewer");
      return viewerPackage.pdfViewer;
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
    manifest: sqliteManifest,
    async load() {
      const viewerPackage = await import("@anyfile/sqlite-viewer");
      return viewerPackage.sqliteViewer;
    },
  },
];

validateRegistrations(viewerRegistrations);
