import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

import { expectedFormat } from "./format-registry";

const PROBE_PREFIX_BYTES = 512;
const MAX_COMPRESSED_PROBE_BYTES = 1024 * 1024;

function abortError() {
  return new DOMException("__anyfile_archive_probe_v1__: aborted", "AbortError");
}

async function read(file: File, signal: AbortSignal, start: number, length: number) {
  if (signal.aborted) throw abortError();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return new Uint8Array(await Promise.race([file.slice(start, start + length).arrayBuffer(), aborted]));
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

function little32(bytes: Uint8Array, offset = 0) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function zipMagic(bytes: Uint8Array) {
  return bytes.length >= 4 && [0x04034b50, 0x06054b50, 0x06064b50, 0x08074b50].includes(little32(bytes));
}

function tarHeader(bytes: Uint8Array) {
  if (bytes.length < 512) return false;
  if (bytes.every((byte) => byte === 0)) return true;
  const magic = new TextDecoder().decode(bytes.subarray(257, 263));
  if (!magic.startsWith("ustar")) return false;
  const checksumText = new TextDecoder().decode(bytes.subarray(148, 156)).replaceAll("\0", "").trim();
  if (!/^[0-7]+$/.test(checksumText)) return false;
  let checksum = 0;
  for (let index = 0; index < 512; index += 1) {
    checksum += index >= 148 && index < 156 ? 32 : bytes[index];
  }
  return checksum === Number.parseInt(checksumText, 8);
}

async function gzipTarHeader(file: File, signal: AbortSignal) {
  if (typeof DecompressionStream === "undefined") return false;
  const source = file.slice(0, Math.min(file.size, MAX_COMPRESSED_PROBE_BYTES)).stream();
  const reader = source.pipeThrough(new DecompressionStream("gzip")).getReader();
  const output = new Uint8Array(512);
  let offset = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (offset < output.length) {
      if (signal.aborted) throw abortError();
      const chunk = await reader.read();
      if (chunk.done) return false;
      const count = Math.min(chunk.value.length, output.length - offset);
      output.set(chunk.value.subarray(0, count), offset);
      offset += count;
    }
    return tarHeader(output);
  } catch {
    if (signal.aborted) throw abortError();
    return false;
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
  }
}

export async function probeArchive({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  const expected = expectedFormat(file.name);
  if (!expected || file.size === 0) return 0;
  const prefix = await read(file, signal, 0, Math.min(PROBE_PREFIX_BYTES, file.size));

  if (expected === "zip") return zipMagic(prefix) ? 2 : 0;
  if (expected === "jmod") {
    return prefix.length >= 8 && prefix[0] === 0x4a && prefix[1] === 0x4d &&
      prefix[2] === 1 && prefix[3] === 0 && zipMagic(prefix.subarray(4)) ? 2 : 0;
  }
  if (expected === "tar") return tarHeader(prefix) ? 2 : 0;
  if (expected === "rar") {
    const signature = Array.from(prefix.subarray(0, 8));
    return signature.slice(0, 7).join(",") === "82,97,114,33,26,7,0" ||
      signature.join(",") === "82,97,114,33,26,7,1,0" ? 2 : 0;
  }
  if (expected === "gzip") {
    if (prefix.length < 3 || prefix[0] !== 0x1f || prefix[1] !== 0x8b || prefix[2] !== 8) return 0;
    const compound = file.name.toLowerCase().endsWith(".tar.gz") ||
      [".tgz", ".crate"].some((suffix) => file.name.toLowerCase().endsWith(suffix));
    return compound ? (await gzipTarHeader(file, signal) ? 2 : 0) : 1;
  }
  if (expected === "xz") return prefix.length >= 6 && prefix.slice(0, 6).join(",") === "253,55,122,88,90,0" ? 1 : 0;
  if (expected === "zstd") return prefix.length >= 4 && little32(prefix) === 0xfd2fb528 ? 1 : 0;
  if (expected === "bzip2") return prefix.length >= 4 && prefix[0] === 0x42 && prefix[1] === 0x5a && prefix[2] === 0x68 ? 1 : 0;
  if (expected === "lz4") return prefix.length >= 4 && little32(prefix) === 0x184d2204 ? 1 : 0;
  if (expected === "zlib") {
    return prefix.length >= 2 && (prefix[0] & 0x0f) === 8 && ((prefix[0] << 8) + prefix[1]) % 31 === 0 ? 1 : 0;
  }
  return 1;
}
