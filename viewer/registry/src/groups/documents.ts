import { calendarContactsManifest } from "@anyfile/calendar-contacts-viewer/manifest";
import { excelManifest } from "@anyfile/excel-viewer/manifest";
import { iworkManifest } from "@anyfile/iwork-viewer/manifest";
import { legacyOfficeManifest } from "@anyfile/legacy-office-viewer/manifest";
import { mindMapManifest } from "@anyfile/mind-map-viewer/manifest";
import { mppManifest } from "@anyfile/mpp-viewer/manifest";
import { ofdManifest } from "@anyfile/ofd-viewer/manifest";
import { pdfManifest } from "@anyfile/pdf-viewer/manifest";
import { postscriptManifest } from "@anyfile/postscript-viewer/manifest";
import { powerpointManifest } from "@anyfile/powerpoint-viewer/manifest";
import { pstManifest } from "@anyfile/pst-viewer/manifest";
import { wordManifest } from "@anyfile/word-viewer/manifest";
import { xpsManifest } from "@anyfile/xps-viewer/manifest";
import type { ViewerRegistryEntry } from "@anyfile/viewer-protocol";

export const documentRegistryEntries: readonly ViewerRegistryEntry[] = [
  {
    manifest: mppManifest,
    async probe(context) { return (await import("@anyfile/mpp-viewer/probe")).probeMpp(context); },
  },
  {
    manifest: pdfManifest,
    async probe(context) { return (await import("@anyfile/pdf-viewer/probe")).probePdf(context); },
  },
  {
    manifest: postscriptManifest,
    async probe(context) { return (await import("@anyfile/postscript-viewer/probe")).probePostscript(context); },
  },
  {
    manifest: xpsManifest,
    async probe(context) { return (await import("@anyfile/xps-viewer/probe")).probeXps(context); },
  },
  {
    manifest: ofdManifest,
    async probe(context) { return (await import("@anyfile/ofd-viewer/probe")).probeOfd(context); },
  },
  {
    manifest: wordManifest,
    async probe(context) { return (await import("@anyfile/word-viewer/probe")).probeWordDocument(context); },
  },
  {
    manifest: excelManifest,
    async probe(context) { return (await import("@anyfile/excel-viewer/probe")).probeExcelWorkbook(context); },
  },
  {
    manifest: powerpointManifest,
    async probe(context) { return (await import("@anyfile/powerpoint-viewer/probe")).probePowerPointPresentation(context); },
  },
  {
    manifest: iworkManifest,
    async probe(context) { return (await import("@anyfile/iwork-viewer/probe")).probeIwork(context); },
  },
  {
    manifest: legacyOfficeManifest,
    async probe(context) { return (await import("@anyfile/legacy-office-viewer/probe")).probeLegacyOffice(context); },
  },
  {
    manifest: calendarContactsManifest,
    async probe(context) { return (await import("@anyfile/calendar-contacts-viewer/probe")).inspectCalendarContacts(context); },
  },
  {
    manifest: pstManifest,
    async probe(context) { return (await import("@anyfile/pst-viewer/probe")).probePst(context); },
  },
  {
    manifest: mindMapManifest,
    async probe(context) { return (await import("@anyfile/mind-map-viewer/probe")).probeMindMap(context); },
  },
];
