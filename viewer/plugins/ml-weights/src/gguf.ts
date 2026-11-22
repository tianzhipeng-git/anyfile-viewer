import { ViewerError } from "@anyfile/viewer-protocol";

import type { ModelDocument, ModelMetadataEntry, ModelTensor } from "./types";

// GGUF is described at https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
// Metadata values can be large strings/arrays, so the whole metadata + tensor-info
// block is bounded before parsing; tensor data itself is never read.

export const MAX_GGUF_STRUCT_BYTES = 200 * 1024 * 1024;
const MAX_ARRAY_DEPTH = 8;

const GGML_TYPE_LABELS: Record<number, string> = {
  0: "F32", 1: "F16", 2: "Q4_0", 3: "Q4_1", 6: "Q5_0", 7: "Q5_1", 8: "Q8_0", 9: "Q8_1",
  10: "Q2_K", 11: "Q3_K", 12: "Q4_K", 13: "Q5_K", 14: "Q6_K", 15: "Q8_K",
  16: "IQ2_XXS", 17: "IQ2_XS", 18: "IQ3_XXS", 19: "IQ1_S", 20: "IQ4_NL", 21: "IQ3_S",
  22: "IQ2_S", 23: "IQ4_XS", 24: "I8", 25: "I16", 26: "I32", 27: "I64", 28: "F64",
  29: "IQ1_M", 30: "BF16", 34: "TQ1_0", 35: "TQ2_0", 39: "MXFP4", 40: "NVFP4",
  41: "Q1_0", 42: "Q2_0", 43: "F8_E4M3",
};

// Element count stored per block for quantized types (0 = not block-quantized).
const GGML_BLOCK_ELEMENTS: Record<number, number> = {
  2: 32, 3: 32, 6: 32, 7: 32, 8: 32, 9: 32,
  10: 256, 11: 256, 12: 256, 13: 256, 14: 256, 15: 256,
  16: 256, 17: 256, 18: 256, 19: 256, 20: 32, 21: 256, 22: 256, 23: 256,
  29: 256, 34: 256, 35: 256, 39: 32, 40: 16, 41: 32, 42: 256, 43: 32,
};

// Bytes per block for the same quantized types.
const GGML_BLOCK_BYTES: Record<number, number> = {
  2: 18, 3: 20, 6: 22, 7: 24, 8: 34, 9: 40,
  10: 84, 11: 110, 12: 144, 13: 176, 14: 210, 15: 292,
  16: 66, 17: 74, 18: 98, 19: 50, 20: 18, 21: 110, 22: 82, 23: 136,
  29: 56, 34: 22, 35: 24, 39: 17, 40: 36, 41: 18, 42: 66, 43: 32,
};

const FIXED_TYPE_BYTES: Record<number, number> = {
  0: 4, 1: 2, 24: 1, 25: 2, 26: 4, 27: 8, 28: 8, 30: 2,
};

// GGUF metadata value type ids.
const T_UINT8 = 0, T_INT8 = 1, T_UINT16 = 2, T_INT16 = 3, T_UINT32 = 4, T_INT32 = 5;
const T_FLOAT32 = 6, T_BOOL = 7, T_STRING = 8, T_ARRAY = 9, T_UINT64 = 10, T_INT64 = 11, T_FLOAT64 = 12;

class Cursor {
  pos = 0;
  constructor(readonly view: DataView, readonly littleEndian: boolean) {}

  private ensure(bytes: number) {
    if (this.pos + bytes > this.view.byteLength) throw new ViewerError("invalid-file", "GGUF 结构超出可读范围。");
  }
  u32(): number { this.ensure(4); const v = this.view.getUint32(this.pos, this.littleEndian); this.pos += 4; return v; }
  u64(): number { this.ensure(8); const v = this.view.getBigUint64(this.pos, this.littleEndian); this.pos += 8; return Number(v); }
  i8(): number { this.ensure(1); return this.view.getInt8(this.pos++); }
  u8(): number { this.ensure(1); return this.view.getUint8(this.pos++); }
  i16(): number { this.ensure(2); const v = this.view.getInt16(this.pos, this.littleEndian); this.pos += 2; return v; }
  u16(): number { this.ensure(2); const v = this.view.getUint16(this.pos, this.littleEndian); this.pos += 2; return v; }
  i32(): number { this.ensure(4); const v = this.view.getInt32(this.pos, this.littleEndian); this.pos += 4; return v; }
  f32(): number { this.ensure(4); const v = this.view.getFloat32(this.pos, this.littleEndian); this.pos += 4; return v; }
  i64(): number { this.ensure(8); const v = this.view.getBigInt64(this.pos, this.littleEndian); this.pos += 8; return Number(v); }
  f64(): number { this.ensure(8); const v = this.view.getFloat64(this.pos, this.littleEndian); this.pos += 8; return v; }
  string(): string {
    const length = this.u64();
    this.ensure(length);
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, length);
    this.pos += length;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function scalarTypeBytes(type: number): number | undefined {
  switch (type) {
    case T_UINT8: case T_INT8: case T_BOOL: return 1;
    case T_UINT16: case T_INT16: return 2;
    case T_UINT32: case T_INT32: case T_FLOAT32: return 4;
    case T_UINT64: case T_INT64: case T_FLOAT64: return 8;
    default: return undefined;
  }
}

function readScalar(cursor: Cursor, type: number): string {
  switch (type) {
    case T_UINT8: return String(cursor.u8());
    case T_INT8: return String(cursor.i8());
    case T_UINT16: return String(cursor.u16());
    case T_INT16: return String(cursor.i16());
    case T_UINT32: return String(cursor.u32());
    case T_INT32: return String(cursor.i32());
    case T_FLOAT32: return String(cursor.f32());
    case T_UINT64: return String(cursor.u64());
    case T_INT64: return String(cursor.i64());
    case T_FLOAT64: return String(cursor.f64());
    case T_BOOL: return cursor.u8() !== 0 ? "true" : "false";
    default: throw new ViewerError("invalid-file", `GGUF 元数据类型 ${type} 无效。`);
  }
}

/** Read a metadata value, summarising arrays instead of expanding every element. */
function readValue(cursor: Cursor, type: number, depth: number): string {
  if (type === T_STRING) return cursor.string();
  if (type !== T_ARRAY) return readScalar(cursor, type);

  if (depth > MAX_ARRAY_DEPTH) throw new ViewerError("invalid-file", "GGUF 元数据数组嵌套过深。");
  const elementType = cursor.u32();
  const length = cursor.u64();
  if (elementType === T_ARRAY) throw new ViewerError("invalid-file", "GGUF 嵌套数组不受支持。");
  const fixed = elementType === T_STRING ? undefined : scalarTypeBytes(elementType);
  if (fixed === undefined && elementType !== T_STRING) {
    throw new ViewerError("invalid-file", `GGUF 数组元素类型 ${elementType} 无效。`);
  }
  if (fixed !== undefined) {
    // Skip fixed-width arrays in one step instead of element by element.
    cursor.pos += fixed * length;
    if (cursor.pos > cursor.view.byteLength) throw new ViewerError("invalid-file", "GGUF 数组超出可读范围。");
    return `[${length.toLocaleString("en-US")} values]`;
  }
  const preview: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const value = cursor.string();
    if (index < 3) preview.push(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  }
  const head = preview.map((item) => JSON.stringify(item)).join(", ");
  return length <= 3 ? `[${head}]` : `[${head}, … ${length.toLocaleString("en-US")} items]`;
}

function tensorTypeBytes(type: number, elementCount: number): number {
  const fixed = FIXED_TYPE_BYTES[type];
  if (fixed !== undefined) return elementCount * fixed;
  const blockElements = GGML_BLOCK_ELEMENTS[type];
  const blockBytes = GGML_BLOCK_BYTES[type];
  if (blockElements === undefined || blockBytes === undefined) return 0;
  return Math.ceil(elementCount / blockElements) * blockBytes;
}

export function detectEndianness(magic: DataView): "little" | "big" | undefined {
  // The four magic bytes are 'G' 'G' 'U' 'F' (0x47 0x47 0x55 0x46).
  // Reading them big-endian on a little-endian writer yields 0x47475546, and the
  // reverse for a big-endian writer, so the read that matches tells us the byte order.
  if (magic.getUint32(0, false) === 0x47475546) return "little";
  if (magic.getUint32(0, true) === 0x47475546) return "big";
  return undefined;
}

export function parseGgufStruct(view: DataView, littleEndian: boolean, fileSize: number): ModelDocument {
  const cursor = new Cursor(view, littleEndian);
  cursor.pos = 4;
  const version = cursor.u32();
  if (version < 1 || version > 3) throw new ViewerError("invalid-file", `不支持的 GGUF 版本 ${version}。`);
  const tensorCount = cursor.u64();
  const metadataCount = cursor.u64();

  const metadata: ModelMetadataEntry[] = [];
  for (let index = 0; index < metadataCount; index += 1) {
    const key = cursor.string();
    const type = cursor.u32();
    metadata.push({ key, value: readValue(cursor, type, 0) });
  }

  const lookup = new Map(metadata.map((entry) => [entry.key, entry.value]));
  let alignment = Number(lookup.get("general.alignment") ?? 32);
  if (!Number.isFinite(alignment) || alignment <= 0) alignment = 32;

  const tensors: ModelTensor[] = [];
  let totalParameters = 0;
  let totalBytes = 0;
  let dataStartMax = cursor.pos;
  for (let index = 0; index < tensorCount; index += 1) {
    const name = cursor.string();
    const dimensionCount = cursor.u32();
    if (dimensionCount > 4) throw new ViewerError("invalid-file", `张量 ${name} 维度数超过 4。`);
    const shape: number[] = [];
    for (let dimension = 0; dimension < dimensionCount; dimension += 1) shape.push(cursor.u64());
    const type = cursor.u32();
    const offset = cursor.u64();
    const elementCount = shape.reduce((product, dimension) => product * dimension, 1);
    const bytes = tensorTypeBytes(type, elementCount);
    totalParameters += elementCount;
    totalBytes += bytes;
    dataStartMax = Math.max(dataStartMax, offset);
    tensors.push({ name, shape, dtype: GGML_TYPE_LABELS[type] ?? `type-${type}`, bytes });
  }

  const tensorDataStart = cursor.pos + ((alignment - (cursor.pos % alignment)) % alignment);
  if (tensorDataStart + dataStartMax > fileSize) throw new ViewerError("invalid-file", "GGUF 张量数据超出文件范围。");

  if (tensors.length === 0) throw new ViewerError("invalid-file", "GGUF 文件不包含任何张量。");

  const architecture = lookup.get("general.architecture");
  return {
    format: "gguf",
    name: lookup.get("general.name") ?? architecture ?? "GGUF model",
    architecture,
    version: `GGUF v${version}`,
    tensorCount: tensors.length,
    totalParameters,
    totalBytes,
    metadata,
    tensors,
  };
}
