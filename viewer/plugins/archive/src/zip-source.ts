import { Reader, ZipReader, type Entry } from "@zip.js/zip.js/lib/zip-core-custom.js";
import { ViewerError } from "@anyfile/viewer-protocol";
import { BOOK_ZIP_LIMITS, readBookZipCatalog, safeBookPath } from "./zip-catalog";

import { ProtectedBookError, checkBookAbort } from "./book-source";
export { ProtectedBookError, checkBookAbort } from "./book-source";
class FileReader extends Reader<Blob> {
  constructor(
    private file: Blob,
    private signal: AbortSignal,
  ) {
    super(file);
    this.size = file.size;
  }
  async readUint8Array(offset: number, length: number) {
    checkBookAbort(this.signal);
    if (length > BOOK_ZIP_LIMITS.entry || offset < 0 || offset + length > this.size)
      throw new ViewerError("resource-limit", "ZIP read limit exceeded.");
    const result = new Uint8Array(await this.file.slice(offset, offset + length).arrayBuffer());
    checkBookAbort(this.signal);
    return result;
  }
}
export async function openBookZip(file: File, signal: AbortSignal) {
  await readBookZipCatalog(file, signal);
  const zip = new ZipReader(new FileReader(file, signal), {
    useWebWorkers: false,
    useCompressionStream: true,
    strictness: "strict",
  });
  const entries = new Map<string, Entry>();
  let total = 0;
  try {
    for await (const entry of zip.getEntriesGenerator()) {
      checkBookAbort(signal);
      if (!safeBookPath(entry.filename) || entries.has(entry.filename) || entry.symlink)
        throw new ViewerError("invalid-file", "Unsafe ZIP path.");
      if (entry.encrypted) throw new ProtectedBookError("Encrypted ZIP");
      total += entry.uncompressedSize;
      if (
        entry.uncompressedSize > BOOK_ZIP_LIMITS.entry ||
        total > BOOK_ZIP_LIMITS.expanded ||
        entry.uncompressedSize > Math.max(1, entry.compressedSize) * BOOK_ZIP_LIMITS.ratio
      )
        throw new ViewerError("resource-limit", "ZIP expansion limit exceeded.");
      if (![0, 8].includes(entry.compressionMethod))
        throw new ViewerError("invalid-file", "Unsupported ZIP compression.");
      entries.set(entry.filename, entry);
    }
  } catch (error) {
    await zip.close();
    throw error;
  }
  let closed = false;
  return {
    entries,
    async read(path: string, limit: number, readSignal = signal): Promise<Uint8Array> {
      checkBookAbort(readSignal);
      checkBookAbort(signal);
      if (closed) throw new DOMException("Closed", "AbortError");
      const entry = entries.get(path);
      if (!entry || entry.directory || !entry.getData)
        throw new ViewerError("missing-related-file", "Missing publication resource.");
      if (entry.uncompressedSize > limit)
        throw new ViewerError("resource-limit", "Publication resource limit exceeded.");
      if (entry.compressionMethod === 8) {
        try {
          new DecompressionStream("deflate-raw");
        } catch {
          throw new ViewerError(
            "unsupported-environment",
            "Native Deflate decompression is unavailable.",
          );
        }
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      const output = new WritableStream<Uint8Array>({
        write(chunk) {
          checkBookAbort(readSignal);
          checkBookAbort(signal);
          size += chunk.length;
          if (size > limit || size > entry.uncompressedSize)
            throw new ViewerError("resource-limit", "ZIP expansion limit exceeded.");
          chunks.push(chunk);
        },
      });
      await entry.getData(output, {
        signal: readSignal,
        checkSignature: true,
        useWebWorkers: false,
        useCompressionStream: true,
      });
      checkBookAbort(readSignal);
      checkBookAbort(signal);
      if (size !== entry.uncompressedSize)
        throw new ViewerError("invalid-file", "Truncated ZIP entry.");
      const result = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    },
    async dispose() {
      if (closed) return;
      closed = true;
      entries.clear();
      await zip.close();
    },
  };
}
export type BookZip = Awaited<ReturnType<typeof openBookZip>>;
