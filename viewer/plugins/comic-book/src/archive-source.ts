import { openBookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import { openComicTar } from "./tar-source";
export async function openComicArchive(file: File, signal: AbortSignal) {
  if (/\.cbt$/i.test(file.name)) return openComicTar(file, signal);
  if (/\.(cbr|cb7)$/i.test(file.name)) return (await import("./archive-client")).openCompressedComic(file, signal);
  return openBookZip(file, signal);
}
