import type { ProbeViewerContext, ViewerSupportLevel } from "@anyfile/viewer-protocol";

const PROBE_HEADER_BYTES = 64;
const FORM_TYPES = new Set(["DJVU", "DJVM", "PM44", "BM44"]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
}

export function inspectDjvuHeader(bytes: Uint8Array): {
  valid: boolean;
  formType?: string;
  indirect?: boolean;
} {
  if (bytes.byteLength < 12) return { valid: false };

  let formOffset = 0;
  if (ascii(bytes, 0, 8) === "AT&TFORM") {
    formOffset = 4;
  } else if (ascii(bytes, 0, 4) !== "FORM") {
    return { valid: false };
  }

  if (bytes.byteLength < formOffset + 12) return { valid: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredSize = view.getUint32(formOffset + 4, false);
  if (declaredSize < 4) return { valid: false };

  const formType = ascii(bytes, formOffset + 8, 4);
  if (!FORM_TYPES.has(formType)) return { valid: false };

  let indirect = false;
  if (formType === "DJVM" && bytes.byteLength >= formOffset + 21) {
    const firstChunk = ascii(bytes, formOffset + 12, 4);
    if (firstChunk === "DIRM") {
      const flags = bytes[formOffset + 20];
      indirect = (flags & 0x80) === 0;
    }
  }

  return { valid: true, formType, indirect };
}

export async function probeDjvu({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");
  if (file.size < 16) return 0;

  const buffer = await file.slice(0, Math.min(file.size, PROBE_HEADER_BYTES)).arrayBuffer();
  if (signal.aborted) throw new DOMException("Viewer operation aborted.", "AbortError");

  const header = inspectDjvuHeader(new Uint8Array(buffer));
  if (!header.valid) return 0;
  return header.indirect ? 2 : 4;
}
