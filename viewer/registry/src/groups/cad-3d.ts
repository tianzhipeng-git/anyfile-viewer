import { cad2dManifest } from "@anyfile/cad-2d-viewer/manifest";
import { dwgManifest } from "@anyfile/cad-dwg-viewer/manifest";
import { cadExchangeManifest } from "@anyfile/cad-exchange-viewer/manifest";
import { ifcManifest } from "@anyfile/ifc-viewer/manifest";
import { mesh3dManifest } from "@anyfile/mesh-3d-viewer/manifest";
import { pointCloudManifest } from "@anyfile/point-cloud-viewer/manifest";
import { print3dManifest } from "@anyfile/print-3d-viewer/manifest";
import { visioManifest } from "@anyfile/visio-viewer/manifest";
import type { ViewerRegistryEntry } from "@anyfile/viewer-protocol";

export const cad3dRegistryEntries: readonly ViewerRegistryEntry[] = [
  {
    manifest: cad2dManifest,
    async probe(context) { return (await import("@anyfile/cad-2d-viewer/probe")).probeCad2d(context); },
  },
  {
    manifest: dwgManifest,
    async probe(context) { return (await import("@anyfile/cad-dwg-viewer/probe")).probeDwg(context); },
  },
  {
    manifest: ifcManifest,
    async probe(context) { return (await import("@anyfile/ifc-viewer/probe")).probeIfc(context); },
  },
  {
    manifest: cadExchangeManifest,
    async probe(context) { return (await import("@anyfile/cad-exchange-viewer/probe")).probeCadExchange(context); },
  },
  {
    manifest: pointCloudManifest,
    async probe(context) { return (await import("@anyfile/point-cloud-viewer/probe")).probePointCloud(context); },
  },
  {
    manifest: print3dManifest,
    async probe(context) { return (await import("@anyfile/print-3d-viewer/probe")).probePrint3d(context); },
  },
  {
    manifest: mesh3dManifest,
    async probe(context) { return (await import("@anyfile/mesh-3d-viewer/probe")).probeMesh3d(context); },
  },
  {
    manifest: visioManifest,
    async probe(context) { return (await import("@anyfile/visio-viewer/probe")).probeVisio(context); },
  },
];
