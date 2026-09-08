import { ViewerError } from "@anyfile/viewer-protocol";
import type { BookSource, BookEntry } from "@anyfile/archive-metadata-viewer/book-source";
import { createBookWorker } from "@anyfile/archive-metadata-viewer/book-worker";
export async function openCompressedComic(file: File, signal: AbortSignal): Promise<BookSource> {
  signal.throwIfAborted();
  if (file.size > 64 * 1024 ** 2) throw new ViewerError("resource-limit", "Compressed comic size limit.");
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") throw new ViewerError("unsupported-environment", "Comic decoder unavailable.");
  const client = createBookWorker(new Worker(new URL("./archive.worker.ts", import.meta.url), { type: "module" }), signal);
  try {
    const result = await client.request<{ entries: BookEntry[]; heapBytes: number; encodedBytes: number }>({ type: "open", file, runtime: new URL("/vendor/comic-archive/3.8.9-anyfile.1/comic-archive.js", location.origin).href });
    signal.throwIfAborted();
    const entries = new Map(result.entries.map(entry => [entry.filename, entry]));
    return {
      entries,
      read(path, limit, readSignal = signal) { return client.request<Uint8Array>({ type: "read", path, limit }, readSignal); },
      async dispose() { client.dispose(); entries.clear(); },
    };
  } catch (error) { client.dispose(); throw error; }
}
