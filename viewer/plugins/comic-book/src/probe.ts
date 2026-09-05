import { comicArchiveKind } from "./signature";
import { openComicTar } from "./tar-source";
import type { ProbeViewerContext } from "@anyfile/viewer-protocol";
import { readBookZipCatalog } from "@anyfile/archive-metadata-viewer/zip-catalog";
export async function probeComicBook({ file, signal }: ProbeViewerContext) {
  signal.throwIfAborted();
  if (/\.cbt$/i.test(file.name)) {
    const source = await openComicTar(file, signal);
    try { return [...source.entries.keys()].some(name => /\.(jpe?g|png|gif|webp|avif)$/i.test(name)) ? 4 : 0; }
    finally { await source.dispose(); }
  }
  if (/\.(cbr|cb7)$/i.test(file.name)) {
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    signal.throwIfAborted();
    return comicArchiveKind(bytes) ? 4 : 0;
  }
  const { names } = await readBookZipCatalog(file, signal);
  return [...names].some((name) => /\.(?:jpe?g|png|gif|webp|avif)$/i.test(name)) ? 4 : 0;
}
