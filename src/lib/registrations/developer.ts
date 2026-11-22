import { archiveMetadataManifest } from "@anyfile/archive-metadata-viewer/manifest";
import { bittorrentManifest } from "@anyfile/bittorrent-viewer/manifest";
import { codeManifest } from "@anyfile/code-viewer/manifest";
import { devArrayManifest } from "@anyfile/dev-array-viewer/manifest";
import { devNativeBinaryManifest } from "@anyfile/dev-native-binary-viewer/manifest";
import { devSourceMapManifest } from "@anyfile/dev-source-map-viewer/manifest";
import { devWasmManifest } from "@anyfile/dev-wasm-viewer/manifest";
import { duckdbManifest } from "@anyfile/duckdb-viewer/manifest";
import { harManifest } from "@anyfile/har-viewer/manifest";
import { mlWeightsManifest } from "@anyfile/ml-weights-viewer/manifest";
import { sqliteManifest } from "@anyfile/sqlite-viewer/manifest";
import { certificateManifest } from "@anyfile/x509-certificate-viewer/manifest";
import type { ViewerPluginRegistration } from "@anyfile/viewer-protocol";

export const developerRegistrations: readonly ViewerPluginRegistration[] = [
  {
    manifest: harManifest,
    async load() { return (await import("@anyfile/har-viewer")).harViewer; },
  },
  {
    manifest: bittorrentManifest,
    async load() { return (await import("@anyfile/bittorrent-viewer")).bittorrentViewer; },
  },
  {
    manifest: mlWeightsManifest,
    async probe(context) { return (await import("@anyfile/ml-weights-viewer/probe")).probeMlWeights(context); },
    async load() { return (await import("@anyfile/ml-weights-viewer")).mlWeightsViewer; },
  },
  {
    manifest: certificateManifest,
    async probe(context) { return (await import("@anyfile/x509-certificate-viewer/probe")).inspectCertificate(context); },
    async load() { return (await import("@anyfile/x509-certificate-viewer")).certificateViewer; },
  },
  {
    manifest: codeManifest,
    async probe(context) { return (await import("@anyfile/code-viewer/probe")).probeCode(context); },
    async load() { return (await import("@anyfile/code-viewer")).codeViewer; },
  },
  {
    manifest: sqliteManifest,
    async probe(context) { return (await import("@anyfile/sqlite-viewer/probe")).probeSQLite(context); },
    async load() { return (await import("@anyfile/sqlite-viewer")).sqliteViewer; },
  },
  {
    manifest: devArrayManifest,
    async probe(context) { return (await import("@anyfile/dev-array-viewer/probe")).probeDevArray(context); },
    async load() { return (await import("@anyfile/dev-array-viewer")).devArrayViewer; },
  },
  {
    manifest: devWasmManifest,
    async probe(context) { return (await import("@anyfile/dev-wasm-viewer/probe")).probeDevWasm(context); },
    async load() { return (await import("@anyfile/dev-wasm-viewer")).devWasmViewer; },
  },
  {
    manifest: devSourceMapManifest,
    async probe(context) { return (await import("@anyfile/dev-source-map-viewer/probe")).probeDevSourceMap(context); },
    async load() { return (await import("@anyfile/dev-source-map-viewer")).devSourceMapViewer; },
  },
  {
    manifest: devNativeBinaryManifest,
    async probe(context) { return (await import("@anyfile/dev-native-binary-viewer/probe")).probeDevNativeBinary(context); },
    async load() { return (await import("@anyfile/dev-native-binary-viewer")).devNativeBinaryViewer; },
  },
  {
    manifest: duckdbManifest,
    async probe(context) { return (await import("@anyfile/duckdb-viewer/probe")).probeDuckDB(context); },
    async load() { return (await import("@anyfile/duckdb-viewer")).duckdbViewer; },
  },
  {
    manifest: archiveMetadataManifest,
    async probe(context) { return (await import("@anyfile/archive-metadata-viewer/probe")).probeArchive(context); },
    async load() { return (await import("@anyfile/archive-metadata-viewer")).archiveMetadataViewer; },
  },
];
