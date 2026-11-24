import { readBlob as readBlobUnbounded } from "@anyfile/viewer-protocol";

export const SVG_INPUT_LIMIT = 128 * 1024 * 1024;
export const SVG_PROBE_BYTES = 64 * 1024;

export async function readBlob(blob: Blob, signal: AbortSignal, limit = SVG_INPUT_LIMIT) {
  const bytes = await readBlobUnbounded(blob, signal);
  if (bytes.byteLength > limit) throw new RangeError("SVG input exceeds the resource limit.");
  return bytes;
}

export async function readSvgBytes(file: File, signal: AbortSignal) {
  if (file.size > SVG_INPUT_LIMIT) throw new RangeError("SVG input exceeds the resource limit.");
  const bytes = await readBlob(file, signal);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return { bytes, compressed: false };
  if (typeof DecompressionStream === "undefined") {
    throw new TypeError("Gzip decompression is unavailable.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return { bytes: await readBlob(await new Response(stream).blob(), signal, SVG_INPUT_LIMIT), compressed: true };
}
