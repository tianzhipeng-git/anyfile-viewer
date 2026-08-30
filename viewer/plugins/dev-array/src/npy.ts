import { ViewerError } from "@anyfile/viewer-protocol";

import { decodeScalar, parseDType, type DType, type StructuredField } from "./dtype";
import { parsePythonLiteral, type PythonValue } from "./python-literal";
import type { ArrayByteSource } from "./source";

const MAGIC = Uint8Array.of(0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59);
const MAX_HEADER_BYTES = 1024 * 1024;
const MAX_DIMENSIONS = 32;
const MAX_PAGE_BYTES = 1024 * 1024;

export type NpyDescriptor = {
  readonly version: string;
  readonly dtype: DType;
  readonly shape: readonly number[];
  readonly fortranOrder: boolean;
  readonly elementCount: number;
  readonly dataOffset: number;
  readonly sourceSize: number;
};

export type ArrayPage = {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  readonly start: number;
  readonly end: number;
  readonly total: number;
};

export function arrayPageSize(descriptor: NpyDescriptor, requestedSize: number): number {
  return Math.min(requestedSize, Math.max(1, Math.floor(MAX_PAGE_BYTES / descriptor.dtype.itemSize)));
}

function invalid(message: string): never {
  throw new ViewerError("invalid-file", `NPY ${message}。`);
}

function sameMagic(bytes: Uint8Array) {
  return MAGIC.every((byte, index) => bytes[index] === byte);
}

function dictionary(value: PythonValue): { [key: string]: PythonValue } {
  if (!value || Array.isArray(value) || typeof value !== "object") return invalid("头部不是字典");
  return value;
}

function shape(value: PythonValue): number[] {
  if (!Array.isArray(value) || value.length > MAX_DIMENSIONS ||
      value.some((dimension) => typeof dimension !== "number" || !Number.isSafeInteger(dimension) || dimension < 0)) {
    return invalid("shape 无效");
  }
  return value as number[];
}

function elementCount(dimensions: readonly number[]) {
  let count = 1;
  for (const dimension of dimensions) {
    count *= dimension;
    if (!Number.isSafeInteger(count)) invalid("元素数量超出安全范围");
  }
  return count;
}

export async function readNpyDescriptor(source: ArrayByteSource): Promise<NpyDescriptor> {
  if (source.size < 10) invalid("文件头已截断");
  const prefix = await source.read(0, Math.min(12, source.size));
  if (!sameMagic(prefix)) invalid("magic 无效");
  const major = prefix[6];
  const minor = prefix[7];
  if (major < 1 || major > 3 || minor !== 0) invalid(`版本 ${major}.${minor} 不受支持`);
  const preambleLength = major === 1 ? 10 : 12;
  if (prefix.length < preambleLength) invalid("文件头已截断");
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  if (headerLength <= 0 || headerLength > MAX_HEADER_BYTES) {
    throw new ViewerError("resource-limit", "NPY 头部超过 1 MiB 安全上限。");
  }
  const dataOffset = preambleLength + headerLength;
  if (!Number.isSafeInteger(dataOffset) || dataOffset > source.size) invalid("头部范围超出文件末尾");
  const headerBytes = await source.read(preambleLength, headerLength);
  const encoding = major === 3 ? "utf-8" : "latin1";
  const headerText = new TextDecoder(encoding, { fatal: true }).decode(headerBytes).trim();
  const parsed = dictionary(parsePythonLiteral(headerText));
  if (!("descr" in parsed) || !("shape" in parsed) || typeof parsed.fortran_order !== "boolean") {
    invalid("缺少 descr、shape 或 fortran_order");
  }
  const dtype = parseDType(parsed.descr);
  const dimensions = shape(parsed.shape);
  const count = elementCount(dimensions);
  if (!dtype.object) {
    const dataBytes = count * dtype.itemSize;
    if (!Number.isSafeInteger(dataBytes) || dataOffset + dataBytes > source.size) invalid("数组数据已截断");
  }
  return {
    version: `${major}.${minor}`,
    dtype,
    shape: dimensions,
    fortranOrder: parsed.fortran_order,
    elementCount: count,
    dataOffset,
    sourceSize: source.size,
  };
}

function coordinates(index: number, dimensions: readonly number[], fortran: boolean) {
  if (dimensions.length === 0) return "()";
  const result = new Array<number>(dimensions.length);
  let remaining = index;
  if (fortran) {
    for (let axis = 0; axis < dimensions.length; axis += 1) {
      result[axis] = remaining % dimensions[axis];
      remaining = Math.floor(remaining / dimensions[axis]);
    }
  } else {
    for (let axis = dimensions.length - 1; axis >= 0; axis -= 1) {
      result[axis] = remaining % dimensions[axis];
      remaining = Math.floor(remaining / dimensions[axis]);
    }
  }
  return `(${result.join(", ")})`;
}

function decodeField(bytes: Uint8Array, offset: number, field: StructuredField): string {
  const count = field.shape.reduce((value, dimension) => value * dimension, 1);
  if (field.dtype.type === "structured") return "[nested structure]";
  if (count === 1) return decodeScalar(bytes, offset, field.dtype);
  const values: string[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(decodeScalar(bytes, offset + index * field.dtype.itemSize, field.dtype));
  }
  return `[${values.join(", ")}]`;
}

export async function readArrayPage(
  source: ArrayByteSource,
  descriptor: NpyDescriptor,
  pageIndex: number,
  pageSize: number,
): Promise<ArrayPage> {
  if (descriptor.dtype.object) invalid("对象数组不能反序列化");
  const effectivePageSize = arrayPageSize(descriptor, pageSize);
  const start = pageIndex * effectivePageSize;
  if (!Number.isSafeInteger(start) || start < 0 || start >= Math.max(1, descriptor.elementCount)) {
    invalid("页码超出数组范围");
  }
  const count = Math.min(effectivePageSize, descriptor.elementCount - start);
  const byteLength = count * descriptor.dtype.itemSize;
  const bytes = await source.read(descriptor.dataOffset + start * descriptor.dtype.itemSize, byteLength);
  const columns = descriptor.dtype.type === "structured"
    ? ["索引", ...descriptor.dtype.fields.map((field) => field.name)]
    : ["索引", "值"];
  const rows: string[][] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = index * descriptor.dtype.itemSize;
    const row = [coordinates(start + index, descriptor.shape, descriptor.fortranOrder)];
    if (descriptor.dtype.type === "structured") {
      for (const field of descriptor.dtype.fields) row.push(decodeField(bytes, offset + field.offset, field));
    } else row.push(decodeScalar(bytes, offset, descriptor.dtype));
    rows.push(row);
  }
  return { columns, rows, start, end: start + count, total: descriptor.elementCount };
}
