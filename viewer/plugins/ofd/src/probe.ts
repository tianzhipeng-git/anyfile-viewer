import { readBookZipCatalog } from "@anyfile/archive-metadata-viewer/zip-catalog";
import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

/** True when the ZIP index has the GB/T 33190 entry file `OFD.xml` at its root. */
export function isOfdCatalog(names: Iterable<string>) {
  for (const name of names) if (name.replace(/^\/+/, "").toLowerCase() === "ofd.xml") return true;
  return false;
}

/** Reads only the ZIP central directory; document XML is validated by `open()`. */
export async function probeOfd({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  try {
    const { names } = await readBookZipCatalog(file, signal);
    return isOfdCatalog(names) ? 4 : 0;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return 0;
  }
}
