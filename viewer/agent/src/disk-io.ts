import { closeSync, openSync, readSync } from "node:fs";
import { open as openAsync } from "node:fs/promises";
import { basename } from "node:path";
import { abortError, type BinarySource } from "@anyfile/viewer-protocol";

/**
 * Read-only random-access `BinarySource` backed by a Node file descriptor.
 * Call `close()` when done to guarantee zero fd leaks.
 */
export class DiskBinarySource implements BinarySource {
  readonly name: string;
  readonly size: number;
  readonly filePath: string;
  private fd: number | null;

  constructor(filePath: string, size: number, name = basename(filePath)) {
    this.filePath = filePath;
    this.size = size;
    this.name = name;
    this.fd = openSync(filePath, "r");
  }

  private ensureFd(): number {
    if (this.fd === null) {
      this.fd = openSync(this.filePath, "r");
    }
    return this.fd;
  }

  async read(offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> {
    if (signal?.aborted) throw abortError();
    const start = Math.max(0, Math.min(offset, this.size));
    const count = Math.max(0, Math.min(length, this.size - start));
    if (count === 0) return new Uint8Array(0);

    const buffer = new Uint8Array(count);
    const bytesRead = this.readSync(start, buffer);
    if (signal?.aborted) throw abortError();
    return bytesRead === count ? buffer : buffer.subarray(0, bytesRead);
  }

  readSync(offset: number, target: Uint8Array): number {
    if (offset < 0 || offset >= this.size || target.byteLength === 0) return 0;
    const fd = this.ensureFd();
    const maxRead = Math.min(target.byteLength, this.size - offset);
    let total = 0;
    while (total < maxRead) {
      const n = readSync(fd, target, total, maxRead - total, offset + total);
      if (n <= 0) break;
      total += n;
    }
    return total;
  }

  close(): void {
    if (this.fd !== null) {
      try {
        closeSync(this.fd);
      } finally {
        this.fd = null;
      }
    }
  }
}

async function readDiskRange(filePath: string, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = Math.max(0, end - start);
  if (length === 0) return new Uint8Array(0);
  const handle = await openAsync(filePath, "r");
  try {
    const out = new Uint8Array(new ArrayBuffer(length));
    let total = 0;
    while (total < length) {
      const { bytesRead } = await handle.read(out, total, length - total, start + total);
      if (bytesRead <= 0) break;
      total += bytesRead;
    }
    return total === length ? out : out.slice(0, total);
  } finally {
    await handle.close();
  }
}

function createDiskSlice(
  filePath: string,
  start: number,
  end: number,
  contentType: string,
): Blob {
  const size = Math.max(0, end - start);
  const sliceObj: Blob = {
    size,
    type: contentType,
    slice(relStart = 0, relEnd = size, nextType = ""): Blob {
      const s = relStart < 0 ? Math.max(size + relStart, 0) : Math.min(relStart, size);
      const e = relEnd < 0 ? Math.max(size + relEnd, 0) : Math.min(relEnd, size);
      return createDiskSlice(filePath, start + s, start + Math.max(s, e), nextType);
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      const bytes = await readDiskRange(filePath, start, end);
      return bytes.buffer;
    },
    async bytes(): Promise<Uint8Array<ArrayBuffer>> {
      return readDiskRange(filePath, start, end);
    },
    async text(): Promise<string> {
      const bytes = await readDiskRange(filePath, start, end);
      return new TextDecoder("utf-8").decode(bytes);
    },
    stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
      const CHUNK_SIZE = 64 * 1024;
      let cursor = start;
      let handle: Awaited<ReturnType<typeof openAsync>> | null = null;
      const closeHandle = async () => {
        if (handle) {
          const h = handle;
          handle = null;
          await h.close().catch(() => undefined);
        }
      };
      return new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start() {
          if (cursor < end) {
            handle = await openAsync(filePath, "r");
          }
        },
        async pull(controller) {
          if (cursor >= end || !handle) {
            await closeHandle();
            controller.close();
            return;
          }
          const toRead = Math.min(CHUNK_SIZE, end - cursor);
          const chunk = new Uint8Array(new ArrayBuffer(toRead));
          const { bytesRead } = await handle.read(chunk, 0, toRead, cursor);
          if (bytesRead <= 0) {
            await closeHandle();
            controller.close();
            return;
          }
          cursor += bytesRead;
          controller.enqueue(bytesRead === toRead ? chunk : chunk.slice(0, bytesRead));
          if (cursor >= end) {
            await closeHandle();
            controller.close();
          }
        },
        async cancel() {
          await closeHandle();
        },
      });
    },
  };
  return sliceObj;
}

/**
 * Lazy read-only `File` implementation backed by disk ranges.
 * `slice()` records offsets without reading bytes; file descriptors are always closed after read.
 */
export function createDiskFile(
  filePath: string,
  name: string,
  size: number,
  lastModified = 0,
): File {
  const base = createDiskSlice(filePath, 0, size, "application/octet-stream");
  return Object.assign(base, {
    name,
    lastModified,
    webkitRelativePath: "",
  }) as File;
}
