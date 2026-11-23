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
import { wordManifest } from "@anyfile/word-viewer/manifest";
import { xpsManifest } from "@anyfile/xps-viewer/manifest";
import type { ViewerPluginRegistration } from "@anyfile/viewer-protocol";

export const documentRegistrations: readonly ViewerPluginRegistration[] = [
  {
    manifest: mppManifest,
    async probe(context) { return (await import("@anyfile/mpp-viewer/probe")).probeMpp(context); },
    async load() { return (await import("@anyfile/mpp-viewer")).mppViewer; },
  },
  {
    manifest: pdfManifest,
    async probe(context) { return (await import("@anyfile/pdf-viewer/probe")).probePdf(context); },
    async load() { return (await import("@anyfile/pdf-viewer")).pdfViewer; },
  },
  {
    manifest: postscriptManifest,
    async probe(context) { return (await import("@anyfile/postscript-viewer/probe")).probePostscript(context); },
    async load() { return (await import("@anyfile/postscript-viewer")).postscriptViewer; },
  },
  {
    manifest: xpsManifest,
    async probe(context) { return (await import("@anyfile/xps-viewer/probe")).probeXps(context); },
    async load() { return (await import("@anyfile/xps-viewer")).xpsViewer; },
  },
  {
    manifest: ofdManifest,
    async probe(context) { return (await import("@anyfile/ofd-viewer/probe")).probeOfd(context); },
    async load() { return (await import("@anyfile/ofd-viewer")).ofdViewer; },
  },
  {
    manifest: wordManifest,
    async probe(context) { return (await import("@anyfile/word-viewer/probe")).probeWordDocument(context); },
    async load() { return (await import("@anyfile/word-viewer")).wordViewer; },
  },
  {
    manifest: excelManifest,
    async probe(context) { return (await import("@anyfile/excel-viewer/probe")).probeExcelWorkbook(context); },
    async load() { return (await import("@anyfile/excel-viewer")).excelViewer; },
  },
  {
    manifest: powerpointManifest,
    async probe(context) { return (await import("@anyfile/powerpoint-viewer/probe")).probePowerPointPresentation(context); },
    async load() { return (await import("@anyfile/powerpoint-viewer")).powerpointViewer; },
  },
  {
    manifest: iworkManifest,
    async probe(context) { return (await import("@anyfile/iwork-viewer/probe")).probeIwork(context); },
    async load() { return (await import("@anyfile/iwork-viewer")).iworkViewer; },
  },
  {
    manifest: legacyOfficeManifest,
    async probe(context) { return (await import("@anyfile/legacy-office-viewer/probe")).probeLegacyOffice(context); },
    async load() { return (await import("@anyfile/legacy-office-viewer")).legacyOfficeViewer; },
  },
  {
    manifest: calendarContactsManifest,
    async probe(context) { return (await import("@anyfile/calendar-contacts-viewer/probe")).inspectCalendarContacts(context); },
    async load() { return (await import("@anyfile/calendar-contacts-viewer")).calendarContactsViewer; },
  },
  {
    manifest: mindMapManifest,
    async probe(context) { return (await import("@anyfile/mind-map-viewer/probe")).probeMindMap(context); },
    async load() { return (await import("@anyfile/mind-map-viewer")).mindMapViewer; },
  },
];
