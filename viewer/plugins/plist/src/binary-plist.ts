import { PLIST_LIMITS, PlistError, type PlistValue } from "./types";

/**
 * Decoder for Apple's binary property list format (`bplist00`).
 *
 * Layout: 8-byte magic `bplist00`, then the object table, an offset table
 * (one entry per object) and a 32-byte trailer holding the offset size, object
 * ref size, object count, top object and offset-table start. Every object is a
 * marker byte followed by its payload; containers store references to other
 * objects rather than inline values.
 *
 * Only the marker/dictionary/array/integer/real/date/data/string/uid markers
 * defined by the format are decoded; null markers map to a `null` value.
 */

const EPOCH_2001_MS = Date.UTC(2001, 0, 1);

function readUInt(bytes: Uint8Array, offset: number, size: number): number {
  let value = 0;
  for (let i = 0; i < size; i += 1) value = value * 256 + bytes[offset + i];
  return value;
}

function readUInt64(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 8; i += 1) value = (value << BigInt(8)) | BigInt(bytes[offset + i]);
  return value;
}

function decodeUtf16BE(bytes: Uint8Array, start: number, length: number): string {
  const units: number[] = [];
  for (let i = 0; i + 1 < length; i += 2) {
    units.push((bytes[start + i] << 8) | bytes[start + i + 1]);
  }
  // Build the string in chunks to avoid argument-count limits on large arrays.
  let result = "";
  for (let i = 0; i < units.length; i += 8192) {
    result += String.fromCharCode(...units.slice(i, i + 8192));
  }
  return result;
}

class BinaryPlistReader {
  private readonly objectRefSize: number;
  private readonly offsetSize: number;
  private readonly objectCount: number;
  private readonly topObject: number;
  private readonly offsets: number[];
  private nodeCount = 0;
  private readonly cache = new Map<number, PlistValue>();

  constructor(private readonly bytes: Uint8Array) {
    const n = bytes.byteLength;
    if (n < 8 + 32) throw new PlistError("invalid-file", "Binary plist is too short.");
    // Trailer is the final 32 bytes.
    const trailer = n - 32;
    this.offsetSize = bytes[trailer + 6];
    this.objectRefSize = bytes[trailer + 7];
    this.objectCount = readUInt(bytes, trailer + 8, 8);
    this.topObject = readUInt(bytes, trailer + 16, 8);
    const offsetTableOffset = readUInt(bytes, trailer + 24, 8);

    if (this.offsetSize < 1 || this.offsetSize > 8 || this.objectRefSize < 1 || this.objectRefSize > 8) {
      throw new PlistError("invalid-file", "Binary plist has an invalid offset or reference size.");
    }
    if (this.objectCount < 1 || this.objectCount > PLIST_LIMITS.maxNodes) {
      throw new PlistError(this.objectCount > PLIST_LIMITS.maxNodes ? "resource-limit" : "invalid-file", "Binary plist has an invalid object count.");
    }
    if (offsetTableOffset < 8 || offsetTableOffset + this.objectCount * this.offsetSize > trailer) {
      throw new PlistError("invalid-file", "Binary plist offset table is out of range.");
    }
    if (this.topObject >= this.objectCount) {
      throw new PlistError("invalid-file", "Binary plist top object is out of range.");
    }

    this.offsets = new Array(this.objectCount);
    for (let i = 0; i < this.objectCount; i += 1) {
      const offset = readUInt(bytes, offsetTableOffset + i * this.offsetSize, this.offsetSize);
      if (offset < 8 || offset >= offsetTableOffset) {
        throw new PlistError("invalid-file", "Binary plist object offset is out of range.");
      }
      this.offsets[i] = offset;
    }
  }

  read(): PlistValue {
    return this.readObject(this.topObject, 0);
  }

  private readObject(ref: number, depth: number): PlistValue {
    const cached = this.cache.get(ref);
    if (cached) return cached;
    if (depth > PLIST_LIMITS.maxDepth) throw new PlistError("resource-limit", "Binary plist nesting is too deep.");
    if (ref < 0 || ref >= this.objectCount) throw new PlistError("invalid-file", "Binary plist references an out-of-range object.");
    if (++this.nodeCount > PLIST_LIMITS.maxNodes) throw new PlistError("resource-limit", "Binary plist has too many objects.");

    const offset = this.offsets[ref];
    const marker = this.bytes[offset];
    const high = marker >> 4;
    const low = marker & 0x0f;
    const value = this.decode(offset, high, low, depth);
    this.cache.set(ref, value);
    return value;
  }

  private decode(offset: number, high: number, low: number, depth: number): PlistValue {
    const bytes = this.bytes;
    switch (high) {
      case 0x0:
        if (low === 0x0) return { kind: "null" };
        if (low === 0x8) return { kind: "boolean", value: false };
        if (low === 0x9) return { kind: "boolean", value: true };
        throw new PlistError("invalid-file", `Unsupported binary plist marker 0x${high.toString(16)}${low.toString(16)}.`);
      case 0x1: {
        // Integer: 2^low bytes, signed for 8-byte, otherwise big-endian.
        const size = 1 << low;
        if (offset + 1 + size > bytes.length) throw new PlistError("invalid-file", "Binary plist integer is out of range.");
        if (size === 8) return { kind: "integer", value: BigInt.asIntN(64, readUInt64(bytes, offset + 1)) };
        let unsigned = BigInt(0);
        for (let i = 0; i < size; i += 1) unsigned = (unsigned << BigInt(8)) | BigInt(bytes[offset + 1 + i]);
        return { kind: "integer", value: BigInt.asIntN(size * 8, unsigned) };
      }
      case 0x2: {
        if (low === 2) {
          if (offset + 1 + 4 > bytes.length) throw new PlistError("invalid-file", "Binary plist real is out of range.");
          const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4);
          return { kind: "real", value: view.getFloat32(0, false) };
        }
        if (low === 3) {
          if (offset + 1 + 8 > bytes.length) throw new PlistError("invalid-file", "Binary plist real is out of range.");
          const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 8);
          return { kind: "real", value: view.getFloat64(0, false) };
        }
        throw new PlistError("invalid-file", "Binary plist has an invalid real marker.");
      }
      case 0x3: {
        if (offset + 1 + 8 > bytes.length) throw new PlistError("invalid-file", "Binary plist date is out of range.");
        // Dates are float64 seconds since 2001-01-01 UTC.
        const view = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 8);
        const seconds = view.getFloat64(0, false);
        return { kind: "date", value: new Date(EPOCH_2001_MS + seconds * 1000) };
      }
      case 0x4: {
        const { length, start } = this.readLengthAndPayload(offset, low);
        if (length > PLIST_LIMITS.maxDataBytes) throw new PlistError("resource-limit", "Binary plist data object is too large.");
        return { kind: "data", value: bytes.subarray(start, start + length) };
      }
      case 0x5: {
        const { length, start } = this.readLengthAndPayload(offset, low);
        const end = Math.min(start + length, bytes.length);
        return { kind: "string", value: new TextDecoder("ascii", { fatal: false }).decode(bytes.subarray(start, end)) };
      }
      case 0x6: {
        const { length, start } = this.readLengthAndPayload(offset, low);
        const end = Math.min(start + length * 2, bytes.length);
        return { kind: "string", value: decodeUtf16BE(bytes, start, end - start) };
      }
      case 0x8: {
        // UID: 1 + low bytes, little-endian in the format.
        const size = low + 1;
        if (offset + 1 + size > bytes.length) throw new PlistError("invalid-file", "Binary plist UID is out of range.");
        let value = BigInt(0);
        for (let i = size - 1; i >= 0; i -= 1) value = (value << BigInt(8)) | BigInt(bytes[offset + 1 + i]);
        return { kind: "uid", value };
      }
      case 0xa:
      case 0xb:
      case 0xc: {
        const { length, start } = this.readLengthAndPayload(offset, low);
        const items: PlistValue[] = [];
        for (let i = 0; i < length; i += 1) {
          const target = readUInt(bytes, start + i * this.objectRefSize, this.objectRefSize);
          items.push(this.readObject(target, depth + 1));
        }
        return { kind: "array", items };
      }
      case 0xd: {
        const { length, start } = this.readLengthAndPayload(offset, low);
        const entries: { key: string; value: PlistValue }[] = [];
        for (let i = 0; i < length; i += 1) {
          const keyRef = readUInt(bytes, start + i * this.objectRefSize, this.objectRefSize);
          const valueRef = readUInt(bytes, start + (length + i) * this.objectRefSize, this.objectRefSize);
          const key = this.readObject(keyRef, depth + 1);
          if (key.kind !== "string") throw new PlistError("invalid-file", "Binary plist dictionary key is not a string.");
          entries.push({ key: key.value, value: this.readObject(valueRef, depth + 1) });
        }
        return { kind: "dict", entries };
      }
      default:
        throw new PlistError("invalid-file", `Unsupported binary plist object marker 0x${high.toString(16)}${low.toString(16)}.`);
    }
  }

  /** Decode the length nibble/int and return the payload start offset and byte length. */
  private readLengthAndPayload(offset: number, low: number): { length: number; start: number } {
    if (low !== 0x0f) return { length: low, start: offset + 1 };
    const intOffset = offset + 1;
    const marker = this.bytes[intOffset];
    if (marker === undefined || marker >> 4 !== 0x1) {
      throw new PlistError("invalid-file", "Binary plist encoded length is invalid.");
    }
    const size = 1 << (marker & 0x0f);
    if (intOffset + 1 + size > this.bytes.length) throw new PlistError("invalid-file", "Binary plist encoded length is out of range.");
    const length = readUInt(this.bytes, intOffset + 1, size);
    return { length, start: intOffset + 1 + size };
  }
}


export function decodeBinaryPlist(bytes: Uint8Array): PlistValue {
  const magic = new TextDecoder("ascii").decode(bytes.subarray(0, 8));
  if (magic !== "bplist00") throw new PlistError("invalid-file", "Not a binary property list.");
  return new BinaryPlistReader(bytes).read();
}
