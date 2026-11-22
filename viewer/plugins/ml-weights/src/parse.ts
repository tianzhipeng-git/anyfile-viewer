import { ViewerError, type ViewerOpenProgress } from "@anyfile/viewer-protocol";

import { detectEndianness, MAX_GGUF_STRUCT_BYTES, parseGgufStruct } from "./gguf";
import { MAX_SAFETENSORS_HEADER_BYTES, parseSafetensorsHeader, readSafetensorsHeaderLength } from "./safetensors";
import type { ModelDocument } from "./types";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function readHead(file: File, signal: AbortSignal, length: number): Promise<Uint8Array> {
  if (signal.aborted) throw abortError();
  const buffer = await file.slice(0, length).arrayBuffer();
  if (signal.aborted) throw abortError();
  return new Uint8Array(buffer);
}

async function readSafetensors(file: File, signal: AbortSignal): Promise<ModelDocument> {
  const head = await readHead(file, signal, Math.min(8, file.size));
  if (head.length < 8) throw new ViewerError("invalid-file", "Safetensors 文件过短。");
  const headerLength = readSafetensorsHeaderLength(new DataView(head.buffer, head.byteOffset, 8));
  if (headerLength <= 0 || headerLength > MAX_SAFETENSORS_HEADER_BYTES) {
    throw new ViewerError("invalid-file", "Safetensors 头部长度无效。");
  }
  const headerBytes = await readHead(file, signal, Math.min(8 + headerLength, file.size));
  return parseSafetensorsHeader(file.size, headerLength, headerBytes.subarray(8));
}

async function readGguf(file: File, signal: AbortSignal): Promise<ModelDocument> {
  // GGUF metadata + tensor descriptions are contiguous at the start of the file;
  // read a bounded window and let the parser report if it overruns.
  const window = Math.min(file.size, MAX_GGUF_STRUCT_BYTES);
  const bytes = await readHead(file, signal, window);
  if (bytes.length < 24) throw new ViewerError("invalid-file", "GGUF 文件过短。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const endianness = detectEndianness(new DataView(bytes.buffer, bytes.byteOffset, 4));
  if (!endianness) throw new ViewerError("invalid-file", "不是有效的 GGUF 文件。");
  return parseGgufStruct(view, endianness === "little", file.size);
}

export async function readModel(
  file: File,
  signal: AbortSignal,
  reportProgress: (progress: ViewerOpenProgress) => void,
): Promise<ModelDocument> {
  reportProgress({ stage: "reading", loaded: 0, total: file.size });
  const head = await readHead(file, signal, Math.min(4, file.size));
  const isGguf = head.length >= 4 && detectEndianness(new DataView(head.buffer, head.byteOffset, 4)) !== undefined;
  const document = isGguf ? await readGguf(file, signal) : await readSafetensors(file, signal);
  if (signal.aborted) throw abortError();
  return document;
}
