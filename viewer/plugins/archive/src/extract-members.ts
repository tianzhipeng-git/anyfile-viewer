import { Reader, ZipReader } from "@zip.js/zip.js/lib/zip-core-custom.js";
import { AgentError, abortError } from "@anyfile/viewer-protocol";

import { SequentialReader } from "./parsers/sequential-reader";
import { RangeReader } from "./range-reader";
import type { ArchiveEntry, IdentifiedFormat } from "./types";
import { decodeZipText } from "./zip-adapter";

const PLUGIN_ID = "archive-metadata-viewer";

/** Random-access ZIP reader over a Blob slice; zip.js only touches the directory and the requested member. */
class BlobZipReader extends Reader<Blob> {
  constructor(
    private readonly blob: Blob,
    private readonly signal: AbortSignal,
  ) {
    super(blob);
    this.size = blob.size;
  }

  override async readUint8Array(offset: number, length: number): Promise<Uint8Array> {
    if (this.signal.aborted) throw abortError();
    return new Uint8Array(await this.blob.slice(offset, offset + length).arrayBuffer());
  }
}

async function readZipMember(
  file: File,
  format: IdentifiedFormat,
  path: string,
  cap: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const zip = new ZipReader(new BlobZipReader(file.slice(format.containerOffset), signal), {
    useWebWorkers: false,
    useCompressionStream: true,
    strictness: "balanced",
    decodeText: decodeZipText,
  });
  try {
    for await (const entry of zip.getEntriesGenerator({ filenameValidation: "tolerant" })) {
      if (signal.aborted) throw abortError();
      if (entry.filename !== path || entry.directory) continue;
      if (entry.encrypted) throw new AgentError("encrypted-file", "The ZIP member is encrypted.", { pluginId: PLUGIN_ID });
      if (![0, 8].includes(entry.compressionMethod) || !entry.getData) {
        throw new AgentError(
          "unsupported-capability",
          `ZIP compression method ${entry.compressionMethod} is not supported for member reads.`,
          { pluginId: PLUGIN_ID },
        );
      }
      // Collect at most `cap` bytes, then stop inflating so oversized or bomb members stay bounded.
      const stop = new AbortController();
      const forward = () => stop.abort();
      signal.addEventListener("abort", forward, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      const output = new WritableStream<Uint8Array>({
        write(chunk) {
          const room = cap - size;
          chunks.push(chunk.byteLength > room ? chunk.subarray(0, room) : chunk);
          size += Math.min(room, chunk.byteLength);
          if (size >= cap) stop.abort();
        },
      });
      try {
        await entry.getData(output, { signal: stop.signal, useWebWorkers: false, useCompressionStream: true });
      } catch (error) {
        if (signal.aborted) throw abortError();
        if (!stop.signal.aborted) throw error;
      } finally {
        signal.removeEventListener("abort", forward);
      }
      return concat(chunks, size);
    }
  } finally {
    await zip.close();
  }
  throw new AgentError("target-not-found", `Archive member not found: "${path}".`, { pluginId: PLUGIN_ID });
}

function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Reads at most `cap` leading bytes of one archive member without loading the whole archive. */
export async function readMemberPrefix(
  file: File,
  format: IdentifiedFormat,
  entry: ArchiveEntry,
  cap: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (format.id === "zip" || format.id === "jmod") return readZipMember(file, format, entry.path, cap, signal);
  if (entry.dataOffset === undefined) {
    throw new AgentError("unsupported-capability", "Member content is not readable for this archive format.", {
      pluginId: PLUGIN_ID,
    });
  }
  const length = Math.min(entry.size ?? 0, cap);
  if (format.id === "tar") return new RangeReader(file, signal).read(entry.dataOffset, length, "index");
  if (typeof DecompressionStream === "undefined") {
    throw new AgentError("runtime-unavailable", "gzip decompression is unavailable.", { pluginId: PLUGIN_ID });
  }
  const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
  // Slack covers the last decompressed chunk overshooting the member end.
  const sequential = new SequentialReader(stream.getReader(), signal, entry.dataOffset + length + 1024 * 1024);
  try {
    return await sequential.read(entry.dataOffset, length);
  } finally {
    await sequential.close();
  }
}
