import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
import { readBookZipCatalog } from "@anyfile/archive-metadata-viewer/zip-catalog";
export async function probeComicBook({ file, signal }: ProbeViewerContext) {
  const { names } = await readBookZipCatalog(file, signal);
  return [...names].some((name) => /\.(?:jpe?g|png|gif|webp|avif)$/i.test(name)) ? 4 : 0;
}
