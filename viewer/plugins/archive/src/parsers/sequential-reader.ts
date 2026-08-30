import { ViewerError } from "@anyfile/viewer-protocol";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

export class SequentialReader {
  readonly size: number;
  private chunk: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private chunkOffset = 0;
  private position = 0;
  private produced = 0;

  constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly signal: AbortSignal,
    maximumBytes: number,
  ) {
    this.size = maximumBytes;
  }

  async read(start: number, length: number): Promise<Uint8Array> {
    this.throwIfAborted();
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < this.position || length < 0) {
      throw new ViewerError("invalid-file", "压缩 TAR 包含无效或逆序的读取范围。");
    }
    await this.consume(start - this.position);
    return this.consume(length, true);
  }

  throwIfAborted(): void {
    if (this.signal.aborted) throw abortError();
  }

  async close(): Promise<void> {
    try {
      await this.reader.cancel();
    } catch {
      // The decompressor may already be closed after a complete TAR stream.
    }
  }

  private async nextChunk(): Promise<void> {
    this.throwIfAborted();
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(abortError());
      this.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const result = await Promise.race([this.reader.read(), aborted]);
      if (result.done) throw new ViewerError("invalid-file", "压缩 TAR 数据已截断。");
      if (result.value.byteLength === 0) return this.nextChunk();
      this.produced += result.value.byteLength;
      if (this.produced > this.size) {
        throw new ViewerError("resource-limit", "压缩 TAR 解压后超过 512 MiB 安全上限。");
      }
      this.chunk = result.value;
      this.chunkOffset = 0;
    } finally {
      if (onAbort) this.signal.removeEventListener("abort", onAbort);
    }
  }

  private async consume(length: number, collect = false): Promise<Uint8Array> {
    const output = collect ? new Uint8Array(length) : new Uint8Array();
    let written = 0;
    while (written < length) {
      if (this.chunkOffset >= this.chunk.length) await this.nextChunk();
      const count = Math.min(length - written, this.chunk.length - this.chunkOffset);
      if (collect) output.set(this.chunk.subarray(this.chunkOffset, this.chunkOffset + count), written);
      this.chunkOffset += count;
      written += count;
      this.position += count;
    }
    return output;
  }
}
