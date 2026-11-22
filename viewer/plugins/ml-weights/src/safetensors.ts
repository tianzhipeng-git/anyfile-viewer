import { ViewerError } from "@anyfile/viewer-protocol";

import type { ModelDocument, ModelTensor } from "./types";

export const MAX_SAFETENSORS_HEADER_BYTES = 100 * 1024 * 1024;

const DTYPE_BYTES: Record<string, number> = {
  BOOL: 1, U8: 1, I8: 1, F8_E4M3: 1, F8_E5M2: 1,
  I16: 2, U16: 2, F16: 2, BF16: 2,
  I32: 4, U32: 4, F32: 4,
  I64: 8, U64: 8, F64: 8,
};

type HeaderEntry = {
  dtype?: unknown;
  shape?: unknown;
  data_offsets?: unknown;
};

function elementBytes(dtype: string): number | undefined {
  return DTYPE_BYTES[dtype];
}

function isUintArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0);
}

/**
 * Parse a safetensors file: an 8-byte little-endian header length, followed by
 * that many bytes of UTF-8 JSON describing the tensors, then raw tensor data.
 * Only the header is read; tensor data is never loaded.
 */
export function parseSafetensorsHeader(fileSize: number, headerLength: number, headerBytes: Uint8Array): ModelDocument {
  if (headerLength <= 0 || headerLength > MAX_SAFETENSORS_HEADER_BYTES || headerLength > fileSize - 8) {
    throw new ViewerError("invalid-file", "Safetensors 头部长度无效或文件被截断。");
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(headerBytes));
  } catch {
    throw new ViewerError("invalid-file", "Safetensors 头部不是有效的 JSON。");
  }
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    throw new ViewerError("invalid-file", "Safetensors 头部结构无效。");
  }

  const header = json as Record<string, HeaderEntry & { format?: unknown }>;
  const metadata: { key: string; value: string }[] = [];
  const tensors: ModelTensor[] = [];
  let totalParameters = 0;
  let totalBytes = 0;

  for (const [name, entry] of Object.entries(header)) {
    if (name === "__metadata__") {
      if (typeof entry === "object" && entry !== null) {
        for (const [key, value] of Object.entries(entry)) metadata.push({ key, value: String(value) });
      }
      continue;
    }
    if (typeof entry !== "object" || entry === null) throw new ViewerError("invalid-file", `张量 ${name} 缺少描述。`);
    const dtype = typeof entry.dtype === "string" ? entry.dtype : undefined;
    if (!dtype) throw new ViewerError("invalid-file", `张量 ${name} 缺少数据类型。`);
    if (!isUintArray(entry.shape)) throw new ViewerError("invalid-file", `张量 ${name} 的形状无效。`);
    const offsets = entry.data_offsets;
    if (!isUintArray(offsets) || offsets.length !== 2 || offsets[0] > offsets[1]) {
      throw new ViewerError("invalid-file", `张量 ${name} 的偏移无效。`);
    }

    const shape = entry.shape;
    const elementCount = shape.reduce((product, dimension) => product * dimension, 1);
    const byteLength = offsets[1] - offsets[0];
    const expected = elementBytes(dtype) !== undefined ? elementCount * elementBytes(dtype)! : byteLength;
    if (byteLength !== expected) {
      throw new ViewerError("invalid-file", `张量 ${name} 的字节数与形状或类型不符。`);
    }

    totalParameters += elementCount;
    totalBytes += byteLength;
    tensors.push({ name, shape, dtype, bytes: byteLength });
  }

  if (tensors.length === 0) throw new ViewerError("invalid-file", "Safetensors 文件不包含任何张量。");

  return {
    format: "safetensors",
    name: "Safetensors",
    version: "Safetensors",
    tensorCount: tensors.length,
    totalParameters,
    totalBytes,
    metadata,
    tensors,
  };
}

export function readSafetensorsHeaderLength(view: DataView): number {
  const low = view.getUint32(0, true);
  const high = view.getUint32(4, true);
  return high * 0x1_0000_0000 + low;
}
