import { ViewerError } from "@anyfile/viewer-protocol";

import type { ReadAuditRecord, ReadPurpose } from "./types";

export const MAX_METADATA_BYTES = 64 * 1024 * 1024;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

export class RangeReader {
  readonly size: number;
  readonly audit: ReadAuditRecord[] = [];
  private bytesRead = 0;

  constructor(
    private readonly file: File,
    private readonly signal: AbortSignal,
    private readonly maximumBytes = MAX_METADATA_BYTES,
  ) {
    this.size = file.size;
  }

  async read(start: number, length: number, purpose: ReadPurpose): Promise<Uint8Array> {
    this.throwIfAborted();
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0) {
      throw new ViewerError("invalid-file", "文件包含无效的元数据偏移。");
    }
    const end = start + length;
    if (!Number.isSafeInteger(end) || end > this.size) {
      throw new ViewerError("invalid-file", "文件的元数据区域已截断。");
    }
    if (this.bytesRead + length > this.maximumBytes) {
      throw new ViewerError("resource-limit", "归档元数据超过 64 MiB 安全上限。");
    }
    this.bytesRead += length;
    if (length > 0) this.audit.push({ start, end, purpose });
    const read = this.file.slice(start, end).arrayBuffer();
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(abortError());
      this.signal.addEventListener("abort", onAbort, { once: true });
    });
    let buffer: ArrayBuffer;
    try {
      buffer = await Promise.race([read, aborted]);
    } finally {
      if (onAbort) this.signal.removeEventListener("abort", onAbort);
    }
    this.throwIfAborted();
    if (buffer.byteLength !== length) {
      throw new ViewerError("invalid-file", "文件的元数据区域已截断。");
    }
    return new Uint8Array(buffer);
  }

  throwIfAborted(): void {
    if (this.signal.aborted) throw abortError();
  }
}
