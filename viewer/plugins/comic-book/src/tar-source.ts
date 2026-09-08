import { ViewerError } from "@anyfile/viewer-protocol";
import type { BookSource, BookEntry } from "@anyfile/archive-metadata-viewer/book-source";
import { safeBookPath } from "@anyfile/archive-metadata-viewer/zip-catalog";
const invalid = () => new ViewerError("invalid-file", "Invalid comic TAR.");
function text(bytes: Uint8Array) { return new TextDecoder("utf-8", { fatal: true }).decode(bytes).split("\0", 1)[0]; }
function octal(bytes: Uint8Array) {
  const value = text(bytes).trim();
  if (!/^[0-7]+$/.test(value)) throw invalid();
  return parseInt(value, 8);
}
export async function openComicTar(file: File, signal: AbortSignal): Promise<BookSource> {
  if (file.size > 2 * 1024 ** 3) throw new ViewerError("resource-limit", "Comic TAR size limit.");
  const entries = new Map<string, BookEntry & { offset: number }>();
  let offset = 0, ended = false, count = 0;
  while (offset + 512 <= file.size) {
    signal.throwIfAborted();
    const block = new Uint8Array(await file.slice(offset, offset + 512).arrayBuffer());
    signal.throwIfAborted();
    if (block.every(byte => byte === 0)) { ended = true; break; }
    const checksum = block.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0);
    if (checksum !== octal(block.subarray(148, 156))) throw invalid();
    const prefix = text(block.subarray(345, 500));
    const filename = (prefix ? prefix + "/" : "") + text(block.subarray(0, 100));
    const size = octal(block.subarray(124, 136));
    const kind = block[156];
    if (![0, 48, 53].includes(kind) || !safeBookPath(filename) || entries.has(filename)) throw invalid();
    if (++count > 10000) throw new ViewerError("resource-limit", "Comic TAR entry limit.");
    if (offset + 512 + size > file.size) throw invalid();
    entries.set(filename, { filename, directory: kind === 53, uncompressedSize: size, offset: offset + 512 });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!ended) throw invalid();
  let disposed = false;
  return {
    entries,
    async read(path, limit, readSignal = signal) {
      signal.throwIfAborted(); readSignal.throwIfAborted();
      if (disposed) throw new DOMException("Closed", "AbortError");
      const entry = entries.get(path);
      if (!entry || entry.directory) throw invalid();
      if (entry.uncompressedSize > limit) throw new ViewerError("resource-limit", "Comic page byte limit.");
      const bytes = new Uint8Array(await file.slice(entry.offset, entry.offset + entry.uncompressedSize).arrayBuffer());
      signal.throwIfAborted(); readSignal.throwIfAborted();
      return bytes;
    },
    async dispose() { disposed = true; entries.clear(); },
  };
}
