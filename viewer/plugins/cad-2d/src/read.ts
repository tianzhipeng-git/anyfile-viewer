export const CAD_INPUT_LIMIT = 64 * 1024 * 1024;
export const CAD_PROBE_BYTES = 64 * 1024;

export function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

export function decodeDxfBytes(bytes: Uint8Array) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    return decoder.decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export async function readDxfText(file: File, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  if (file.size > CAD_INPUT_LIMIT) {
    throw new RangeError("DXF input exceeds the resource limit.");
  }
  const buffer = new Uint8Array(await file.arrayBuffer());
  if (signal.aborted) throw abortError();
  return decodeDxfBytes(buffer);
}
