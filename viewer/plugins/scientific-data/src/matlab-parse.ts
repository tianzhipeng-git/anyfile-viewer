import { Unzlib } from "fflate";
import { ViewerError } from "@anyfile/viewer-protocol";
import { totalElementsOf } from "./types";

export const MI_INT8 = 1;
export const MI_UINT8 = 2;
export const MI_INT16 = 3;
export const MI_UINT16 = 4;
export const MI_INT32 = 5;
export const MI_UINT32 = 6;
export const MI_SINGLE = 7;
export const MI_DOUBLE = 9;
export const MI_INT64 = 12;
export const MI_UINT64 = 13;
export const MI_MATRIX = 14;
export const MI_COMPRESSED = 15;
export const MI_UTF8 = 16;
export const MI_UTF16 = 17;

export const MX_CELL = 1;
export const MX_STRUCT = 2;
export const MX_OBJECT = 3;
export const MX_CHAR = 4;
export const MX_SPARSE = 5;
export const MX_DOUBLE = 6;
export const MX_SINGLE = 7;
export const MX_INT8 = 8;
export const MX_UINT8 = 9;
export const MX_INT16 = 10;
export const MX_UINT16 = 11;
export const MX_INT32 = 12;
export const MX_UINT32 = 13;
export const MX_INT64 = 14;
export const MX_UINT64 = 15;

export const MAX_DECOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_NESTING_DEPTH = 32;

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

export function mxClassName(mxClass: number, isLogical: boolean, isComplex: boolean): string {
  if (isLogical) return "logical";
  const base =
    mxClass === MX_DOUBLE ? "float64"
    : mxClass === MX_SINGLE ? "float32"
    : mxClass === MX_INT8 ? "int8"
    : mxClass === MX_UINT8 ? "uint8"
    : mxClass === MX_INT16 ? "int16"
    : mxClass === MX_UINT16 ? "uint16"
    : mxClass === MX_INT32 ? "int32"
    : mxClass === MX_UINT32 ? "uint32"
    : mxClass === MX_INT64 ? "int64"
    : mxClass === MX_UINT64 ? "uint64"
    : mxClass === MX_CHAR ? "char"
    : mxClass === MX_SPARSE ? "sparse float64"
    : mxClass === MX_STRUCT ? "struct"
    : mxClass === MX_CELL ? "cell"
    : mxClass === MX_OBJECT ? "object"
    : `mxClass(${mxClass})`;
  return isComplex ? `${base} (complex)` : base;
}

export function isNumericMxClass(mxClass: number): boolean {
  return (mxClass >= MX_DOUBLE && mxClass <= MX_UINT64) || mxClass === MX_SPARSE;
}

export function align8(n: number): number {
  return (n + 7) & ~7;
}

export type MatTag = {
  readonly dataType: number;
  readonly numBytes: number;
  readonly dataOffset: number;
  readonly nextOffset: number;
};

export function readTag(bytes: Uint8Array, offset: number, littleEndian: boolean): MatTag {
  if (offset + 8 > bytes.length) {
    throw new ViewerError("invalid-file", "Unexpected end of MATLAB MAT-file while reading tag");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firstWord = view.getUint32(offset, littleEndian);
  const upper16 = firstWord >>> 16;
  if (upper16 !== 0) {
    const dataType = firstWord & 0xffff;
    const numBytes = upper16;
    if (numBytes > 4) {
      throw new ViewerError("invalid-file", "Invalid MATLAB small data element length");
    }
    return { dataType, numBytes, dataOffset: offset + 4, nextOffset: offset + 8 };
  }
  const dataType = firstWord;
  const numBytes = view.getUint32(offset + 4, littleEndian);
  const dataOffset = offset + 8;
  const nextOffset = dataType === MI_COMPRESSED ? dataOffset + numBytes : dataOffset + align8(numBytes);
  return { dataType, numBytes, dataOffset, nextOffset };
}

export function unzlibBounded(compressed: Uint8Array, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let overflow = false;
  const inflater = new Unzlib((chunk) => {
    total += chunk.byteLength;
    if (total > maxBytes) {
      overflow = true;
      return;
    }
    chunks.push(chunk);
  });
  try {
    inflater.push(compressed, true);
  } catch {
    if (!overflow) {
      throw new ViewerError("invalid-file", "Failed to decompress MATLAB miCOMPRESSED element");
    }
  }
  if (overflow) {
    throw new ViewerError(
      "resource-limit",
      `MATLAB compressed variable exceeds ${Math.round(maxBytes / (1024 * 1024))} MiB limit`,
    );
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return out;
}

export function unzlibPrefix(compressed: Uint8Array, prefixBytes = 1024): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflater = new Unzlib((chunk) => {
    if (total >= prefixBytes) return;
    const take = Math.min(chunk.byteLength, prefixBytes - total);
    chunks.push(chunk.subarray(0, take));
    total += take;
  });
  const step = 1024;
  for (let off = 0; off < compressed.length && total < prefixBytes; off += step) {
    const end = Math.min(compressed.length, off + step);
    try {
      inflater.push(compressed.subarray(off, end), end === compressed.length);
    } catch {
      if (total > 0) break;
      throw new ViewerError("invalid-file", "Corrupt MATLAB compressed stream");
    }
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.byteLength;
  }
  return out;
}

export function readNumericElement(
  bytes: Uint8Array,
  dataOffset: number,
  numBytes: number,
  dataType: number,
  littleEndian: boolean,
): Float64Array | BigInt64Array | BigUint64Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset + dataOffset, Math.min(numBytes, bytes.length - dataOffset));
  switch (dataType) {
    case MI_INT8: {
      const out = new Float64Array(view.byteLength);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getInt8(i);
      return out;
    }
    case MI_UINT8: {
      const out = new Float64Array(view.byteLength);
      for (let i = 0; i < out.length; i += 1) out[i] = view.getUint8(i);
      return out;
    }
    case MI_INT16: {
      const n = Math.floor(view.byteLength / 2);
      const out = new Float64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = view.getInt16(i * 2, littleEndian);
      return out;
    }
    case MI_UINT16: {
      const n = Math.floor(view.byteLength / 2);
      const out = new Float64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = view.getUint16(i * 2, littleEndian);
      return out;
    }
    case MI_INT32: {
      const n = Math.floor(view.byteLength / 4);
      const out = new Float64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = view.getInt32(i * 4, littleEndian);
      return out;
    }
    case MI_UINT32: {
      const n = Math.floor(view.byteLength / 4);
      const out = new Float64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = view.getUint32(i * 4, littleEndian);
      return out;
    }
    case MI_SINGLE: {
      const n = Math.floor(view.byteLength / 4);
      const out = new Float64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = view.getFloat32(i * 4, littleEndian);
      return out;
    }
    case MI_DOUBLE: {
      const n = Math.floor(view.byteLength / 8);
      const out = new Float64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = view.getFloat64(i * 8, littleEndian);
      return out;
    }
    case MI_INT64: {
      const n = Math.floor(view.byteLength / 8);
      const out = new BigInt64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = view.getBigInt64(i * 8, littleEndian);
      return out;
    }
    case MI_UINT64: {
      const n = Math.floor(view.byteLength / 8);
      const out = new BigUint64Array(n);
      for (let i = 0; i < n; i += 1) out[i] = view.getBigUint64(i * 8, littleEndian);
      return out;
    }
    default:
      return new Float64Array(0);
  }
}

export function decodeMatChar(
  bytes: Uint8Array,
  dataOffset: number,
  numBytes: number,
  dataType: number,
  littleEndian: boolean,
): string {
  const slice = bytes.subarray(dataOffset, Math.min(bytes.length, dataOffset + numBytes));
  if (dataType === MI_UTF8 || dataType === MI_UINT8 || dataType === MI_INT8) {
    return utf8Decoder.decode(slice);
  }
  if (dataType === MI_UINT16 || dataType === MI_UTF16 || dataType === MI_INT16) {
    const view = new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
    const chars: string[] = [];
    for (let i = 0; i + 1 < slice.byteLength; i += 2) {
      chars.push(String.fromCharCode(view.getUint16(i, littleEndian)));
    }
    return chars.join("");
  }
  return utf8Decoder.decode(slice);
}

export type MatMatrixHeader = {
  readonly name: string;
  readonly mxClass: number;
  readonly isComplex: boolean;
  readonly isLogical: boolean;
  readonly shape: readonly number[];
  readonly payloadOffset: number;
};

export function parseMatrixHeader(
  bytes: Uint8Array,
  matrixDataOffset: number,
  matrixEndOffset: number,
  littleEndian: boolean,
): MatMatrixHeader {
  let pos = matrixDataOffset;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const flagsTag = readTag(bytes, pos, littleEndian);
  if (flagsTag.dataOffset + 8 > bytes.length) {
    throw new ViewerError("invalid-file", "Truncated MATLAB array flags");
  }
  const flags0 = view.getUint32(flagsTag.dataOffset, littleEndian);
  const mxClass = flags0 & 0xff;
  const isComplex = (flags0 & 0x0800) !== 0;
  const isLogical = (flags0 & 0x0200) !== 0;
  pos = flagsTag.nextOffset;

  const dimsTag = readTag(bytes, pos, littleEndian);
  const ndims = Math.floor(dimsTag.numBytes / 4);
  const shape: number[] = [];
  for (let i = 0; i < ndims; i += 1) {
    shape.push(view.getInt32(dimsTag.dataOffset + i * 4, littleEndian));
  }
  pos = dimsTag.nextOffset;

  const nameTag = readTag(bytes, pos, littleEndian);
  const nameBytes = bytes.subarray(nameTag.dataOffset, Math.min(bytes.length, nameTag.dataOffset + nameTag.numBytes));
  const name = utf8Decoder.decode(nameBytes).replace(/\0+$/, "");
  pos = Math.min(matrixEndOffset, nameTag.nextOffset);

  return { name, mxClass, isComplex, isLogical, shape, payloadOffset: pos };
}

export type ParsedMatValue = {
  readonly name: string;
  readonly mxClass: number;
  readonly isComplex: boolean;
  readonly isLogical: boolean;
  readonly shape: readonly number[];
  readonly real?: Float64Array | BigInt64Array | BigUint64Array;
  readonly imag?: Float64Array | BigInt64Array | BigUint64Array;
  readonly text?: string;
  readonly sparse?: {
    readonly ir: Float64Array;
    readonly jc: Float64Array;
    readonly pr: Float64Array;
    readonly pi?: Float64Array;
  };
  readonly children?: readonly { readonly name: string; readonly value: ParsedMatValue }[];
  readonly objectClassName?: string;
};

export function parseMatrixValue(
  bytes: Uint8Array,
  matrixOffset: number,
  littleEndian: boolean,
  depth = 0,
): { value: ParsedMatValue; nextOffset: number } {
  if (depth > MAX_NESTING_DEPTH) {
    throw new ViewerError("resource-limit", "MATLAB nested struct/cell depth exceeds limit");
  }
  const tag = readTag(bytes, matrixOffset, littleEndian);
  if (tag.dataType !== MI_MATRIX) {
    throw new ViewerError("invalid-file", `Expected MATLAB miMATRIX tag, got ${tag.dataType}`);
  }
  const endOffset = Math.min(bytes.length, tag.dataOffset + tag.numBytes);
  if (tag.numBytes === 0) {
    return {
      value: { name: "", mxClass: MX_DOUBLE, isComplex: false, isLogical: false, shape: [0, 0], real: new Float64Array(0) },
      nextOffset: tag.nextOffset,
    };
  }
  const header = parseMatrixHeader(bytes, tag.dataOffset, endOffset, littleEndian);
  let pos = header.payloadOffset;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (header.mxClass === MX_CELL) {
    const count = totalElementsOf(header.shape);
    const children: { name: string; value: ParsedMatValue }[] = [];
    for (let i = 0; i < count && pos + 8 <= endOffset; i += 1) {
      const child = parseMatrixValue(bytes, pos, littleEndian, depth + 1);
      children.push({ name: `[${i}]`, value: child.value });
      pos = child.nextOffset;
    }
    return { value: { ...header, children }, nextOffset: tag.nextOffset };
  }

  if (header.mxClass === MX_STRUCT || header.mxClass === MX_OBJECT) {
    let objectClassName: string | undefined;
    if (header.mxClass === MX_OBJECT && pos + 8 <= endOffset) {
      const clsTag = readTag(bytes, pos, littleEndian);
      objectClassName = utf8Decoder
        .decode(bytes.subarray(clsTag.dataOffset, clsTag.dataOffset + clsTag.numBytes))
        .replace(/\0+$/, "");
      pos = clsTag.nextOffset;
    }
    const fnLenTag = readTag(bytes, pos, littleEndian);
    const fieldNameLength = view.getInt32(fnLenTag.dataOffset, littleEndian);
    pos = fnLenTag.nextOffset;
    const fnTag = readTag(bytes, pos, littleEndian);
    const numFields = fieldNameLength > 0 ? Math.floor(fnTag.numBytes / fieldNameLength) : 0;
    const fieldNames: string[] = [];
    for (let i = 0; i < numFields; i += 1) {
      const start = fnTag.dataOffset + i * fieldNameLength;
      const raw = bytes.subarray(start, Math.min(bytes.length, start + fieldNameLength));
      const zero = raw.indexOf(0);
      fieldNames.push(utf8Decoder.decode(zero >= 0 ? raw.subarray(0, zero) : raw));
    }
    pos = fnTag.nextOffset;
    const count = Math.max(1, totalElementsOf(header.shape));
    const children: { name: string; value: ParsedMatValue }[] = [];
    if (count === 1) {
      for (let f = 0; f < numFields && pos + 8 <= endOffset; f += 1) {
        const child = parseMatrixValue(bytes, pos, littleEndian, depth + 1);
        children.push({ name: fieldNames[f] || `field_${f}`, value: child.value });
        pos = child.nextOffset;
      }
    } else {
      for (let idx = 0; idx < count && pos + 8 <= endOffset; idx += 1) {
        const elemFields: { name: string; value: ParsedMatValue }[] = [];
        for (let f = 0; f < numFields && pos + 8 <= endOffset; f += 1) {
          const child = parseMatrixValue(bytes, pos, littleEndian, depth + 1);
          elemFields.push({ name: fieldNames[f] || `field_${f}`, value: child.value });
          pos = child.nextOffset;
        }
        children.push({
          name: `[${idx}]`,
          value: {
            name: `[${idx}]`,
            mxClass: MX_STRUCT,
            isComplex: false,
            isLogical: false,
            shape: [1, 1],
            children: elemFields,
          },
        });
      }
    }
    return { value: { ...header, children, objectClassName }, nextOffset: tag.nextOffset };
  }

  if (header.mxClass === MX_CHAR) {
    let text = "";
    if (pos + 8 <= endOffset) {
      const dataTag = readTag(bytes, pos, littleEndian);
      text = decodeMatChar(bytes, dataTag.dataOffset, dataTag.numBytes, dataTag.dataType, littleEndian);
    }
    return { value: { ...header, text }, nextOffset: tag.nextOffset };
  }

  if (header.mxClass === MX_SPARSE) {
    const irTag = readTag(bytes, pos, littleEndian);
    const ir = readNumericElement(bytes, irTag.dataOffset, irTag.numBytes, irTag.dataType, littleEndian) as Float64Array;
    pos = irTag.nextOffset;
    const jcTag = readTag(bytes, pos, littleEndian);
    const jc = readNumericElement(bytes, jcTag.dataOffset, jcTag.numBytes, jcTag.dataType, littleEndian) as Float64Array;
    pos = jcTag.nextOffset;
    const prTag = readTag(bytes, pos, littleEndian);
    const pr = readNumericElement(bytes, prTag.dataOffset, prTag.numBytes, prTag.dataType, littleEndian) as Float64Array;
    pos = prTag.nextOffset;
    let pi: Float64Array | undefined;
    if (header.isComplex && pos + 8 <= endOffset) {
      const piTag = readTag(bytes, pos, littleEndian);
      pi = readNumericElement(bytes, piTag.dataOffset, piTag.numBytes, piTag.dataType, littleEndian) as Float64Array;
    }
    return { value: { ...header, sparse: { ir, jc, pr, pi } }, nextOffset: tag.nextOffset };
  }

  let real: Float64Array | BigInt64Array | BigUint64Array | undefined;
  let imag: Float64Array | BigInt64Array | BigUint64Array | undefined;
  if (pos + 8 <= endOffset) {
    const realTag = readTag(bytes, pos, littleEndian);
    real = readNumericElement(bytes, realTag.dataOffset, realTag.numBytes, realTag.dataType, littleEndian);
    pos = realTag.nextOffset;
    if (header.isComplex && pos + 8 <= endOffset) {
      const imagTag = readTag(bytes, pos, littleEndian);
      imag = readNumericElement(bytes, imagTag.dataOffset, imagTag.numBytes, imagTag.dataType, littleEndian);
    }
  }
  return { value: { ...header, real, imag }, nextOffset: tag.nextOffset };
}
