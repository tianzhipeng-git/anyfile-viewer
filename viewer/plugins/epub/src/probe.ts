import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
import { readBookZipCatalog } from "@anyfile/archive-metadata-viewer/zip-catalog";
export async function probeEpub({ file, signal }: ProbeViewerContext) {
  const { names } = await readBookZipCatalog(file, signal);
  return names.has("mimetype") && names.has("META-INF/container.xml") ? 4 : 0;
}
