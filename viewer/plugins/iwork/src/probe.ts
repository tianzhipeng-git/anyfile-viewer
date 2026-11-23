import { readBookZipCatalog } from "@anyfile/archive-metadata-viewer/zip-catalog";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { detectIworkLayout, iworkAppFromName } from "./layout";

/** Reads only the ZIP central directory; the IWA/XML payloads are validated by `open()`. */
export async function probeIwork({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  const app = iworkAppFromName(file.name);
  if (!app) return 0;
  let names: ReadonlySet<string>;
  try {
    ({ names } = await readBookZipCatalog(file, signal));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return 0;
  }
  const layout = detectIworkLayout(names, app);
  if (!layout) return 0;
  if (layout.kind === "xml") return 2;
  // Encrypted documents still route here so the user sees an explicit password message.
  return layout.kind === "encrypted" ? 1 : 3;
}
