import { selectMessages, ViewerError, type Locale, type ViewerOpenProgress } from "@anyfile/viewer-protocol";

import { detectEndianness, GgufBoundsError, MAX_GGUF_STRUCT_BYTES, parseGgufStruct } from "./gguf";
import { MAX_SAFETENSORS_HEADER_BYTES, parseSafetensorsHeader, readSafetensorsHeaderLength } from "./safetensors";
import type { ModelDocument } from "./types";

const GGUF_READ_WINDOWS = [
  1024 * 1024,
  8 * 1024 * 1024,
  32 * 1024 * 1024,
  MAX_GGUF_STRUCT_BYTES,
] as const;

function parseCopy(locale: Locale) {
  return selectMessages(locale, {
    en: {
      safetensorsTooShort: "Safetensors file is too short.",
      safetensorsInvalidLength: "Invalid safetensors header length or truncated file.",
      safetensorsHeaderLimit: "Safetensors header exceeds the 100 MiB browser limit.",
      ggufTooShort: "GGUF file is too short.",
      ggufInvalid: "Not a valid GGUF file.",
      ggufTruncated: "GGUF structure extends past the readable file range.",
      ggufStructLimit: "GGUF metadata and tensor descriptors exceed the 200 MiB browser limit.",
    },
    "zh-CN": {
      safetensorsTooShort: "Safetensors 文件过短。",
      safetensorsInvalidLength: "Safetensors 头部长度无效或文件被截断。",
      safetensorsHeaderLimit: "Safetensors 头部超过 100 MiB 浏览器安全上限。",
      ggufTooShort: "GGUF 文件过短。",
      ggufInvalid: "不是有效的 GGUF 文件。",
      ggufTruncated: "GGUF 结构超出可读范围。",
      ggufStructLimit: "GGUF 元数据与张量描述区超过 200 MiB 浏览器安全上限。",
    },
  });
}

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function readHead(file: File, signal: AbortSignal, length: number): Promise<Uint8Array> {
  if (signal.aborted) throw abortError();
  const buffer = await file.slice(0, length).arrayBuffer();
  if (signal.aborted) throw abortError();
  return new Uint8Array(buffer);
}

async function readSafetensors(file: File, signal: AbortSignal, locale: Locale): Promise<ModelDocument> {
  const copy = parseCopy(locale);
  const head = await readHead(file, signal, Math.min(8, file.size));
  if (head.length < 8) throw new ViewerError("invalid-file", copy.safetensorsTooShort);
  const headerLength = readSafetensorsHeaderLength(new DataView(head.buffer, head.byteOffset, 8));
  if (headerLength <= 0 || headerLength > file.size - 8) {
    throw new ViewerError("invalid-file", copy.safetensorsInvalidLength);
  }
  if (headerLength > MAX_SAFETENSORS_HEADER_BYTES) {
    throw new ViewerError("resource-limit", copy.safetensorsHeaderLimit);
  }
  const headerBytes = await readHead(file, signal, 8 + headerLength);
  return parseSafetensorsHeader(file.size, headerLength, headerBytes.subarray(8), locale);
}

async function readGguf(file: File, signal: AbortSignal, locale: Locale): Promise<ModelDocument> {
  const copy = parseCopy(locale);
  if (file.size < 24) throw new ViewerError("invalid-file", copy.ggufTooShort);

  // Grow the header read window progressively so multi-GB GGUF files only read
  // their small metadata + tensor-info prefix instead of eagerly loading 200 MiB.
  let previousWindow = 0;
  for (const targetWindow of GGUF_READ_WINDOWS) {
    const window = Math.min(file.size, targetWindow);
    if (window <= previousWindow) break;
    previousWindow = window;

    const bytes = await readHead(file, signal, window);
    if (bytes.length < 24) throw new ViewerError("invalid-file", copy.ggufTooShort);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    const endianness = detectEndianness(new DataView(bytes.buffer, bytes.byteOffset, 4));
    if (!endianness) throw new ViewerError("invalid-file", copy.ggufInvalid);

    try {
      return parseGgufStruct(view, endianness === "little", file.size, locale);
    } catch (error) {
      if (!(error instanceof GgufBoundsError)) throw error;
      if (window >= file.size) throw new ViewerError("invalid-file", copy.ggufTruncated, { cause: error });
      if (window >= MAX_GGUF_STRUCT_BYTES) throw new ViewerError("resource-limit", copy.ggufStructLimit, { cause: error });
    }
  }

  throw new ViewerError("resource-limit", copy.ggufStructLimit);
}

export async function readModel(
  file: File,
  signal: AbortSignal,
  reportProgress: (progress: ViewerOpenProgress) => void,
  locale: Locale = "en",
): Promise<ModelDocument> {
  reportProgress({ stage: "reading", loaded: 0, total: file.size });
  const head = await readHead(file, signal, Math.min(4, file.size));
  const isGguf = head.length >= 4 && detectEndianness(new DataView(head.buffer, head.byteOffset, 4)) !== undefined;
  const document = isGguf ? await readGguf(file, signal, locale) : await readSafetensors(file, signal, locale);
  if (signal.aborted) throw abortError();
  return document;
}
