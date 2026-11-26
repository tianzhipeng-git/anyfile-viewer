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
import { plistManifest } from "@anyfile/plist-viewer/manifest";
import { scientificDataManifest } from "@anyfile/scientific-data-viewer/manifest";
import { sqliteManifest } from "@anyfile/sqlite-viewer/manifest";
import { statDataManifest } from "@anyfile/stat-data-viewer/manifest";
import { certificateManifest } from "@anyfile/x509-certificate-viewer/manifest";
import type { ViewerRegistryEntry } from "@anyfile/viewer-protocol";

export const developerRegistryEntries: readonly ViewerRegistryEntry[] = [
  { manifest: harManifest },
  { manifest: bittorrentManifest },
  {
    manifest: mlWeightsManifest,
    async probe(context) { return (await import("@anyfile/ml-weights-viewer/probe")).probeMlWeights(context); },
  },
  {
    manifest: plistManifest,
    async probe(context) { return (await import("@anyfile/plist-viewer/probe")).probePlistFile(context); },
  },
  {
    manifest: certificateManifest,
    async probe(context) { return (await import("@anyfile/x509-certificate-viewer/probe")).inspectCertificate(context); },
  },
  {
    manifest: codeManifest,
    async probe(context) { return (await import("@anyfile/code-viewer/probe")).probeCode(context); },
  },
  {
    manifest: sqliteManifest,
    async probe(context) { return (await import("@anyfile/sqlite-viewer/probe")).probeSQLite(context); },
  },
  {
    manifest: statDataManifest,
    async probe(context) { return (await import("@anyfile/stat-data-viewer/probe")).probeStatData(context); },
  },
  {
    manifest: scientificDataManifest,
    async probe(context) { return (await import("@anyfile/scientific-data-viewer/probe")).probeScientificData(context); },
  },
  {
    manifest: devArrayManifest,
    async probe(context) { return (await import("@anyfile/dev-array-viewer/probe")).probeDevArray(context); },
  },
  {
    manifest: devWasmManifest,
    async probe(context) { return (await import("@anyfile/dev-wasm-viewer/probe")).probeDevWasm(context); },
  },
  {
    manifest: devSourceMapManifest,
    async probe(context) { return (await import("@anyfile/dev-source-map-viewer/probe")).probeDevSourceMap(context); },
  },
  {
    manifest: devNativeBinaryManifest,
    async probe(context) { return (await import("@anyfile/dev-native-binary-viewer/probe")).probeDevNativeBinary(context); },
  },
  {
    manifest: duckdbManifest,
    async probe(context) { return (await import("@anyfile/duckdb-viewer/probe")).probeDuckDB(context); },
  },
  {
    manifest: archiveMetadataManifest,
    async probe(context) { return (await import("@anyfile/archive-metadata-viewer/probe")).probeArchive(context); },
  },
];
