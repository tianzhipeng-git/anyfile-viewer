export const SVG_INPUT_LIMIT = 16 * 1024 * 1024;
export const SVG_PROBE_BYTES = 64 * 1024;

export function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

async function readStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal, limit: number) {
  if (signal.aborted) throw abortError();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => void reader.cancel();
  signal.addEventListener("abort", cancel, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RangeError("SVG input exceeds the resource limit.");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (signal.aborted) throw abortError();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }

  if (signal.aborted) throw abortError();
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function readBlob(blob: Blob, signal: AbortSignal, limit = SVG_INPUT_LIMIT) {
  return readStream(blob.stream(), signal, limit);
}

export async function readSvgBytes(file: File, signal: AbortSignal) {
  if (file.size > SVG_INPUT_LIMIT) throw new RangeError("SVG input exceeds the resource limit.");
  const bytes = await readBlob(file, signal);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return { bytes, compressed: false };
  if (typeof DecompressionStream === "undefined") {
    throw new TypeError("Gzip decompression is unavailable.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return { bytes: await readStream(stream, signal, SVG_INPUT_LIMIT), compressed: true };
}
