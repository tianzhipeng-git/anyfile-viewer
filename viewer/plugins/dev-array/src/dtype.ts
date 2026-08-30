import { ViewerError } from "@anyfile/viewer-protocol";

import type { PythonValue } from "./python-literal";

export type ScalarDType = {
  readonly type: "scalar";
  readonly byteOrder: "<" | ">" | "|" | "=";
  readonly kind: string;
  readonly itemSize: number;
  readonly source: string;
  readonly object: boolean;
};

export type StructuredField = {
  readonly name: string;
  readonly dtype: DType;
  readonly offset: number;
  readonly shape: readonly number[];
  readonly itemSize: number;
};

export type StructuredDType = {
  readonly type: "structured";
  readonly fields: readonly StructuredField[];
  readonly itemSize: number;
  readonly source: string;
  readonly object: boolean;
};

export type DType = ScalarDType | StructuredDType;

function invalid(message: string): never {
  throw new ViewerError("invalid-file", `NPY dtype ${message}。`);
}

function product(shape: readonly number[]): number {
  let value = 1;
  for (const dimension of shape) {
    if (!Number.isSafeInteger(dimension) || dimension < 0) invalid("子数组 shape 无效");
    value *= dimension;
    if (!Number.isSafeInteger(value)) invalid("子数组过大");
  }
  return value;
}

function scalar(source: string): ScalarDType {
  const match = source.match(/^([<>=|]?)([?biufcSUVOMm])([0-9]*)$/);
  if (!match) invalid(`“${source}”不受支持`);
  const byteOrder = (match[1] || "=") as ScalarDType["byteOrder"];
  const kind = match[2] === "?" ? "b" : match[2];
  const declaredSize = Number(match[3] || (kind === "b" ? 1 : 0));
  const itemSize = kind === "U" ? declaredSize * 4 : declaredSize;
  if (!Number.isSafeInteger(itemSize) || itemSize <= 0 || itemSize > 1024 * 1024) invalid("元素大小无效");
  const sizes: Readonly<Record<string, readonly number[] | "any">> = {
    b: [1], i: [1, 2, 4, 8], u: [1, 2, 4, 8], f: [2, 4, 8], c: [8, 16],
    S: "any", U: "any", V: "any", O: "any", M: [8], m: [8],
  };
  const allowed = sizes[kind];
  if (allowed !== "any" && !allowed?.includes(itemSize)) invalid(`“${source}”的元素大小无效`);
  return { type: "scalar", byteOrder, kind, itemSize, source, object: kind === "O" };
}

function shapeValue(value: PythonValue): number[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) invalid("子数组 shape 无效");
  return value as number[];
}

function fieldDType(value: PythonValue): { dtype: DType; shape: number[] } {
  if (typeof value === "string") return { dtype: scalar(value), shape: [] };
  if (Array.isArray(value) && value.length === 2 && (typeof value[0] === "string" || Array.isArray(value[0])) && Array.isArray(value[1])) {
    return { dtype: parseDType(value[0]), shape: shapeValue(value[1]) };
  }
  return { dtype: parseDType(value), shape: [] };
}

function structured(value: PythonValue[]): StructuredDType {
  const fields: StructuredField[] = [];
  let offset = 0;
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2 || item.length > 3 || typeof item[0] !== "string") {
      invalid("结构化字段描述无效");
    }
    const parsed = fieldDType(item[1]);
    const shape = item.length === 3 ? shapeValue(item[2]) : parsed.shape;
    const itemSize = parsed.dtype.itemSize * product(shape);
    if (!Number.isSafeInteger(itemSize) || !Number.isSafeInteger(offset + itemSize)) invalid("结构化 dtype 过大");
    fields.push({ name: item[0], dtype: parsed.dtype, offset, shape, itemSize });
    offset += itemSize;
  }
  if (fields.length === 0 || offset <= 0 || offset > 1024 * 1024) invalid("结构化元素大小无效");
  return {
    type: "structured",
    fields,
    itemSize: offset,
    source: JSON.stringify(value),
    object: fields.some((field) => field.dtype.object),
  };
}

export function parseDType(value: PythonValue): DType {
  if (typeof value === "string") return scalar(value);
  if (Array.isArray(value)) return structured(value);
  return invalid("描述必须是字符串或字段列表");
}

function float16(value: number): number {
  const sign = value & 0x8000 ? -1 : 1;
  const exponent = (value >>> 10) & 0x1f;
  const fraction = value & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 31) return fraction ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function littleEndian(dtype: ScalarDType) {
  return dtype.byteOrder !== ">";
}

function formatNumber(value: number | bigint) {
  if (typeof value === "bigint") return value.toString();
  if (Number.isNaN(value)) return "NaN";
  if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
  return String(value);
}

export function decodeScalar(bytes: Uint8Array, offset: number, dtype: ScalarDType): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, dtype.itemSize);
  const little = littleEndian(dtype);
  if (dtype.kind === "b") return view.getUint8(0) ? "true" : "false";
  if (dtype.kind === "i") {
    const value = dtype.itemSize === 1 ? view.getInt8(0) : dtype.itemSize === 2 ? view.getInt16(0, little)
      : dtype.itemSize === 4 ? view.getInt32(0, little) : view.getBigInt64(0, little);
    return formatNumber(value);
  }
  if (dtype.kind === "u") {
    const value = dtype.itemSize === 1 ? view.getUint8(0) : dtype.itemSize === 2 ? view.getUint16(0, little)
      : dtype.itemSize === 4 ? view.getUint32(0, little) : view.getBigUint64(0, little);
    return formatNumber(value);
  }
  if (dtype.kind === "f") {
    const value = dtype.itemSize === 2 ? float16(view.getUint16(0, little))
      : dtype.itemSize === 4 ? view.getFloat32(0, little) : view.getFloat64(0, little);
    return formatNumber(value);
  }
  if (dtype.kind === "c") {
    const component = dtype.itemSize / 2;
    const read = (position: number) => component === 4 ? view.getFloat32(position, little) : view.getFloat64(position, little);
    const real = read(0);
    const imaginary = read(component);
    return `${formatNumber(real)}${imaginary < 0 ? "" : "+"}${formatNumber(imaginary)}j`;
  }
  if (dtype.kind === "S") {
    const zero = bytes.subarray(offset, offset + dtype.itemSize).indexOf(0);
    const value = bytes.subarray(offset, offset + (zero < 0 ? dtype.itemSize : zero));
    return new TextDecoder("latin1").decode(value);
  }
  if (dtype.kind === "U") {
    const chunks: string[] = [];
    const points: number[] = [];
    for (let index = 0; index < dtype.itemSize; index += 4) {
      const point = view.getUint32(index, little);
      if (point) points.push(point <= 0x10ffff ? point : 0xfffd);
      if (points.length === 4096) chunks.push(String.fromCodePoint(...points.splice(0)));
    }
    if (points.length) chunks.push(String.fromCodePoint(...points));
    return chunks.join("");
  }
  if (dtype.kind === "M" || dtype.kind === "m") return formatNumber(view.getBigInt64(0, little));
  return Array.from(bytes.subarray(offset, offset + dtype.itemSize), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
