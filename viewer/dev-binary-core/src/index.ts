export interface ByteSource {
  readonly size: number;
  read(start: number, length: number): Promise<Uint8Array>;
}

export function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

export function assertSafeRange(size: number, start: number, length: number) {
  const end = start + length;
  if (!Number.isSafeInteger(size) || !Number.isSafeInteger(start) || !Number.isSafeInteger(length)
      || size < 0 || start < 0 || length < 0 || !Number.isSafeInteger(end) || end > size) {
    throw new RangeError("Binary range is outside the source.");
  }
  return end;
}

export async function readFileRange(
  file: File,
  signal: AbortSignal,
  start: number,
  length: number,
): Promise<Uint8Array> {
  const end = assertSafeRange(file.size, start, length);
  if (signal.aborted) throw abortError();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    const buffer = await Promise.race([file.slice(start, end).arrayBuffer(), aborted]);
    if (buffer.byteLength !== length) throw new RangeError("Binary source is truncated.");
    return new Uint8Array(buffer);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export class FileByteSource implements ByteSource {
  readonly size: number;

  constructor(private readonly file: File, private readonly signal: AbortSignal) {
    this.size = file.size;
  }

  read(start: number, length: number) {
    return readFileRange(this.file, this.signal, start, length);
  }
}

export class BinaryCursor {
  private positionValue: number;
  private cache?: { start: number; bytes: Uint8Array };

  constructor(
    private readonly source: ByteSource,
    start = 0,
    readonly end = source.size,
    private readonly chunkSize = 64 * 1024,
  ) {
    assertSafeRange(source.size, start, end - start);
    this.positionValue = start;
  }

  get position() { return this.positionValue; }
  get remaining() { return this.end - this.positionValue; }

  async readByte() {
    if (this.positionValue >= this.end) throw new RangeError("Binary source is truncated.");
    const cache = this.cache;
    if (!cache || this.positionValue < cache.start
        || this.positionValue >= cache.start + cache.bytes.length) {
      const length = Math.min(this.chunkSize, this.end - this.positionValue);
      this.cache = { start: this.positionValue, bytes: await this.source.read(this.positionValue, length) };
    }
    const active = this.cache!;
    const value = active.bytes[this.positionValue - active.start];
    this.positionValue += 1;
    return value;
  }

  async readBytes(length: number) {
    const next = assertSafeRange(this.end, this.positionValue, length);
    const bytes = await this.source.read(this.positionValue, length);
    this.positionValue = next;
    return bytes;
  }

  skip(length: number) {
    this.positionValue = assertSafeRange(this.end, this.positionValue, length);
  }

  async readULEB(maxBits = 32): Promise<bigint> {
    if (!Number.isInteger(maxBits) || maxBits < 1 || maxBits > 64) throw new RangeError("Invalid ULEB width.");
    const maxBytes = Math.ceil(maxBits / 7);
    let value = BigInt(0);
    for (let index = 0; index < maxBytes; index += 1) {
      const byte = await this.readByte();
      value |= BigInt(byte & 0x7f) << BigInt(index * 7);
      if ((byte & 0x80) === 0) {
        if (value >= (BigInt(1) << BigInt(maxBits))) throw new RangeError("ULEB value exceeds its width.");
        return value;
      }
    }
    throw new RangeError("Malformed ULEB value.");
  }

  async readULEBNumber(maxBits = 32) {
    const value = await this.readULEB(maxBits);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("ULEB value is not a safe integer.");
    return Number(value);
  }
}
