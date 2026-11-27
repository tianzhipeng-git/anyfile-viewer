import { safeBookPath } from "@anyfile/archive-metadata-viewer/zip-catalog";
import type { BookEntry } from "@anyfile/archive-metadata-viewer/book-source";
import { comicArchiveKind } from "./signature";
export interface ArchiveModule {
  HEAPU8: Uint8Array; UTF8ToString(pointer: number): string;
  _malloc(size: number): number; _free(pointer: number): void;
  _open_archive(pointer: number, size: number, kind: number): number;
  _close_archive(): void; _next_entry(): number;
  _entry_name(): number; _entry_size(): number; _entry_kind(): number;
  _entry_link(): number; _entry_encrypted(): number;
  _read_entry(pointer: number, size: number): number; _archive_error(): number;
}
/** Vendor path (under `/vendor/`) of the libarchive build shared by the Worker and the Agent extractor. */
export const COMIC_ARCHIVE_RUNTIME = "comic-archive/3.8.9-anyfile.1/";
export const COMPRESSED_COMIC_LIMIT = 128 * 1024 ** 2;
/** Error messages are stable codes: protected, invalid-file, resource-limit, missing-related-file, unsupported-environment. */
export const fail = (code: string): never => { throw new Error(code); };
/** Lists a whole RAR/7z archive, keeping only page images and ComicInfo.xml in memory. */
export function readCompressedArchive(bytes: Uint8Array, mod: ArchiveModule) {
  const kind = comicArchiveKind(bytes);
  if (!kind) fail("invalid-file");
  const pointer = mod._malloc(bytes.length), buffer = mod._malloc(64 * 1024);
  if (!pointer || !buffer) fail("resource-limit");
  const entries: BookEntry[] = [];
  const stored = new Map<string, Uint8Array>();
  const seen = new Set<string>();
  let total = 0;
  function check(result: number) {
    if (result >= 0) return;
    const error = mod.UTF8ToString(mod._archive_error());
    if (/encrypt|passphrase|password/i.test(error)) fail("protected");
    fail(/memory|alloc/i.test(error) ? "resource-limit" : "invalid-file");
  }
  try {
    mod.HEAPU8.set(bytes, pointer);
    check(mod._open_archive(pointer, bytes.length, kind));
    while (true) {
      const status = mod._next_entry();
      if (status === 1) break;
      check(status);
      if (mod._entry_encrypted()) fail("protected");
      const filename = mod.UTF8ToString(mod._entry_name()), size = mod._entry_size();
      const directory = mod._entry_kind() === 0o40000;
      if (!safeBookPath(filename) || seen.has(filename) || mod._entry_link() || (!directory && mod._entry_kind() !== 0o100000)) fail("invalid-file");
      seen.add(filename);
      if (seen.size > 10000 || size < 0 || size > 32 * 1024 ** 2 || !Number.isSafeInteger(size)) fail("resource-limit");
      total += size;
      if (total > 128 * 1024 ** 2 || total > Math.max(bytes.length, 1024) * 1000) fail("resource-limit");
      const wanted = /\.(jpe?g|png|gif|webp|avif)$/i.test(filename) || filename === "ComicInfo.xml";
      if (wanted && size > (filename === "ComicInfo.xml" ? 256 * 1024 : 16 * 1024 ** 2)) fail("resource-limit");
      const output = wanted ? new Uint8Array(size) : undefined;
      let offset = 0;
      while (true) {
        const length = mod._read_entry(buffer, 64 * 1024);
        check(length);
        if (!length) break;
        if (offset + length > size) fail("invalid-file");
        output?.set(mod.HEAPU8.subarray(buffer, buffer + length), offset);
        offset += length;
      }
      if (offset !== size) fail("invalid-file");
      if (output) stored.set(filename, output);
      entries.push({ filename, directory, uncompressedSize: size });
    }
    return { entries, stored, heapBytes: mod.HEAPU8.byteLength, encodedBytes: total };
  } finally { mod._close_archive(); mod._free(pointer); mod._free(buffer); }
}
