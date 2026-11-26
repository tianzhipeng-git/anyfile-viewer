import { hexManifest } from "@anyfile/hex-viewer/manifest";
import {
  validateRegistrations,
  type ViewerRegistryEntry,
} from "@anyfile/viewer-protocol";
import { cad3dRegistryEntries } from "./groups/cad-3d";
import { developerRegistryEntries } from "./groups/developer";
import { documentRegistryEntries } from "./groups/documents";
import { imageRegistryEntries } from "./groups/images";
import { mediaRegistryEntries } from "./groups/media";
import { publicationRegistryEntries } from "./groups/publications";

// Group order determines tie-breaking for shared extensions at the same probe level:
// publications/documents before archive-metadata and code; media before images and code;
// developer (native .obj) before cad-3d (Wavefront .obj); hex-viewer last as catch-all.
export const viewerRegistryEntries: readonly ViewerRegistryEntry[] = [
  ...publicationRegistryEntries,
  ...mediaRegistryEntries,
  ...imageRegistryEntries,
  ...documentRegistryEntries,
  ...developerRegistryEntries,
  ...cad3dRegistryEntries,
  { manifest: hexManifest },
];

validateRegistrations(viewerRegistryEntries);
