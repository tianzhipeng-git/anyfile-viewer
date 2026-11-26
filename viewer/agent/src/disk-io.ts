import { closeSync, openAsBlob, openSync, readSync } from "node:fs";
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

/** Lazy read-only `File` over a disk path: a real Blob, so `slice()` reads only the bytes asked for. */
export async function openDiskFile(filePath: string, name: string, lastModified = 0): Promise<File> {
  return new File([await openAsBlob(filePath)], name, { lastModified });
}
