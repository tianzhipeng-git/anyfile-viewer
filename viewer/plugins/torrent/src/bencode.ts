// Minimal Bencode decoder. Decodes the whole document and, optionally, records
// the raw byte span of one top-level dictionary value. The BitTorrent infohash
// is the SHA-1 of the exact `info` dictionary bytes, so those raw bytes matter.

export class BencodeError extends Error {
  constructor(message: string, readonly offset: number) {
    super(message);
    this.name = "BencodeError";
  }
}

export type BencodeSpan = { readonly start: number; readonly end: number };

export type BencodeValue =
  | number
  | Uint8Array
  | { readonly [key: string]: BencodeValue }
  | BencodeValue[];

const MAX_DEPTH = 512;

class Decoder {
  private pos = 0;
  /** Span of the value stored under `trackKey` in the top-level dictionary. */
  trackedSpan?: BencodeSpan;

  constructor(private readonly bytes: Uint8Array, private readonly trackKey?: string) {}

  decode(): BencodeValue {
    const value = this.value(0, true);
    if (this.pos !== this.bytes.length) throw new BencodeError("Trailing bytes after value", this.pos);
    return value;
  }

  private value(depth: number, topLevel = false): BencodeValue {
    if (depth > MAX_DEPTH) throw new BencodeError("Nesting too deep", this.pos);
    const byte = this.bytes[this.pos];
    if (byte === undefined) throw new BencodeError("Unexpected end of input", this.pos);
    if (byte === 0x69 /* i */) return this.integer();
    if (byte === 0x6c /* l */) return this.list(depth + 1);
    if (byte === 0x64 /* d */) return this.dictionary(depth + 1, topLevel);
    if (byte >= 0x30 && byte <= 0x39 /* 0-9 */) return this.byteString();
    throw new BencodeError(`Unexpected byte 0x${byte.toString(16)}`, this.pos);
  }

  private integer(): number {
    const start = this.pos;
    let end = start + 1;
    while (this.bytes[end] !== 0x65 /* e */) {
      if (end >= this.bytes.length) throw new BencodeError("Unterminated integer", start);
      end += 1;
    }
    const text = new TextDecoder("ascii").decode(this.bytes.subarray(start + 1, end));
    if (!/^-?\d+$/.test(text)) throw new BencodeError(`Invalid integer "${text}"`, start);
    const value = Number(text);
    if (!Number.isSafeInteger(value)) throw new BencodeError("Integer out of range", start);
    this.pos = end + 1;
    return value;
  }

  private readLength(): number {
    const start = this.pos;
    let end = start;
    while (this.bytes[end] !== 0x3a /* : */) {
      if (end >= this.bytes.length) throw new BencodeError("Missing string length delimiter", start);
      end += 1;
    }
    const text = new TextDecoder("ascii").decode(this.bytes.subarray(start, end));
    if (!/^\d+$/.test(text)) throw new BencodeError(`Invalid string length "${text}"`, start);
    this.pos = end + 1;
    return Number(text);
  }

  private byteString(): Uint8Array {
    const start = this.pos;
    const length = this.readLength();
    if (this.pos + length > this.bytes.length) throw new BencodeError("String exceeds input", start);
    const slice = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return slice;
  }

  private list(depth: number): BencodeValue[] {
    this.pos += 1; // consume 'l'
    const items: BencodeValue[] = [];
    while (this.bytes[this.pos] !== 0x65 /* e */) {
      if (this.pos >= this.bytes.length) throw new BencodeError("Unterminated list", this.pos);
      items.push(this.value(depth));
    }
    this.pos += 1; // consume 'e'
    return items;
  }

  private dictionary(depth: number, topLevel: boolean): Record<string, BencodeValue> {
    this.pos += 1; // consume 'd'
    const result: Record<string, BencodeValue> = Object.create(null);
    while (this.bytes[this.pos] !== 0x65 /* e */) {
      const byte = this.bytes[this.pos];
      if (byte === undefined) throw new BencodeError("Unterminated dictionary", this.pos);
      if (byte < 0x30 || byte > 0x39) throw new BencodeError("Dictionary key must be a byte string", this.pos);
      const key = new TextDecoder("utf-8").decode(this.byteString());
      if (key in result) throw new BencodeError(`Duplicate key "${key}"`, this.pos);
      const valueStart = this.pos;
      result[key] = this.value(depth);
      if (topLevel && key === this.trackKey) this.trackedSpan = { start: valueStart, end: this.pos };
    }
    this.pos += 1; // consume 'e'
    return result;
  }
}

export function decodeBencode(bytes: Uint8Array): BencodeValue {
  return new Decoder(bytes).decode();
}

export function decodeBencodeWithSpan(
  bytes: Uint8Array,
  trackKey: string,
): { value: BencodeValue; span?: BencodeSpan } {
  const decoder = new Decoder(bytes, trackKey);
  const value = decoder.decode();
  return { value, span: decoder.trackedSpan };
}
