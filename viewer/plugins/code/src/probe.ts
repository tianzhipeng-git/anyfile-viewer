import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const PROBE_BYTES = 64 * 1024;
const MAX_CONTROL_RATIO = 0.05;

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function isUnexpectedControl(character: string) {
  const code = character.charCodeAt(0);
  return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0c && code !== 0x0d)
    || code === 0x7f;
}

export async function probeCode(
  { file, signal }: ProbeViewerContext,
): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw abortError();
  if (file.size === 0) return 3;

  const bytes = new Uint8Array(await file.slice(0, PROBE_BYTES).arrayBuffer());
  if (signal.aborted) throw abortError();
  if (bytes.includes(0)) return 0;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes, {
      stream: file.size > bytes.byteLength,
    });
  } catch {
    return 0;
  }

  let controlCharacters = 0;
  for (const character of text) {
    if (isUnexpectedControl(character)) controlCharacters += 1;
  }
  return controlCharacters / Math.max(text.length, 1) <= MAX_CONTROL_RATIO ? 3 : 0;
}
