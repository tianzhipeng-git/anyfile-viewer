import { cad2dManifest } from "@anyfile/cad-2d-viewer/manifest";
import { dwgManifest } from "@anyfile/cad-dwg-viewer/manifest";
import { cadExchangeManifest } from "@anyfile/cad-exchange-viewer/manifest";
import { ifcManifest } from "@anyfile/ifc-viewer/manifest";
import { mesh3dManifest } from "@anyfile/mesh-3d-viewer/manifest";
import { pointCloudManifest } from "@anyfile/point-cloud-viewer/manifest";
import { print3dManifest } from "@anyfile/print-3d-viewer/manifest";
import { visioManifest } from "@anyfile/visio-viewer/manifest";
import type { ViewerPluginRegistration } from "@anyfile/viewer-protocol";

export const cad3dRegistrations: readonly ViewerPluginRegistration[] = [
  {
    manifest: cad2dManifest,
    async probe(context) { return (await import("@anyfile/cad-2d-viewer/probe")).probeCad2d(context); },
    async load() { return (await import("@anyfile/cad-2d-viewer")).cad2dViewer; },
  },
  {
    manifest: dwgManifest,
    async probe(context) { return (await import("@anyfile/cad-dwg-viewer/probe")).probeDwg(context); },
    async load() { return (await import("@anyfile/cad-dwg-viewer")).dwgViewer; },
  },
  {
    manifest: ifcManifest,
    async probe(context) { return (await import("@anyfile/ifc-viewer/probe")).probeIfc(context); },
    async load() { return (await import("@anyfile/ifc-viewer")).ifcViewer; },
  },
  {
    manifest: cadExchangeManifest,
    async probe(context) { return (await import("@anyfile/cad-exchange-viewer/probe")).probeCadExchange(context); },
    async load() { return (await import("@anyfile/cad-exchange-viewer")).cadExchangeViewer; },
  },
  {
    manifest: pointCloudManifest,
    async probe(context) { return (await import("@anyfile/point-cloud-viewer/probe")).probePointCloud(context); },
    async load() { return (await import("@anyfile/point-cloud-viewer")).pointCloudViewer; },
  },
  {
    manifest: print3dManifest,
    async probe(context) { return (await import("@anyfile/print-3d-viewer/probe")).probePrint3d(context); },
    async load() { return (await import("@anyfile/print-3d-viewer")).print3dViewer; },
  },
  {
    manifest: mesh3dManifest,
    async probe(context) { return (await import("@anyfile/mesh-3d-viewer/probe")).probeMesh3d(context); },
    async load() { return (await import("@anyfile/mesh-3d-viewer")).mesh3dViewer; },
  },
  {
    manifest: visioManifest,
    async probe(context) { return (await import("@anyfile/visio-viewer/probe")).probeVisio(context); },
    async load() { return (await import("@anyfile/visio-viewer")).visioViewer; },
  },
];
