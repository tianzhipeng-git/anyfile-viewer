import { hexManifest } from "@anyfile/hex-viewer/manifest";
import {
  validateRegistrations,
  type ViewerPluginRegistration,
} from "@anyfile/viewer-protocol";
import { cad3dRegistrations } from "./registrations/cad-3d";
import { developerRegistrations } from "./registrations/developer";
import { documentRegistrations } from "./registrations/documents";
import { imageRegistrations } from "./registrations/images";
import { mediaRegistrations } from "./registrations/media";
import { publicationRegistrations } from "./registrations/publications";

// Group order determines tie-breaking for shared extensions at the same probe level:
// publications/documents before archive-metadata and code; media before images and code;
// developer (native .obj) before cad-3d (Wavefront .obj); hex-viewer last as catch-all.
export const viewerRegistrations: readonly ViewerPluginRegistration[] = [
  ...publicationRegistrations,
  ...mediaRegistrations,
  ...imageRegistrations,
  ...documentRegistrations,
  ...developerRegistrations,
  ...cad3dRegistrations,
  {
    manifest: hexManifest,
    async load() { return (await import("@anyfile/hex-viewer")).hexViewer; },
  },
];

validateRegistrations(viewerRegistrations);
