import { readBlob, type ProbeViewerContext, type ViewerSupportLevel } from "@anyfile/viewer-protocol";
import { HDR_PROBE_BYTES } from "./types";

export const EXR_MAGIC = [0x76, 0x2f, 0x31, 0x01] as const;

export function isOpenExrHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  if (
    bytes[0] !== EXR_MAGIC[0] ||
    bytes[1] !== EXR_MAGIC[1] ||
    bytes[2] !== EXR_MAGIC[2] ||
    bytes[3] !== EXR_MAGIC[3]
  ) {
    return false;
  }
  const version = bytes[4];
  // OpenEXR specification defines version 2; reserved high bits must be 0.
  const flags = bytes[5] | (bytes[6] << 8) | (bytes[7] << 16);
  return version === 2 && (flags & ~0x1e) === 0;
}

export function isRadianceHdrHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 11) return false;
  const text = new TextDecoder("ascii", { fatal: false }).decode(bytes.subarray(0, Math.min(bytes.byteLength, 2048)));
  const startsWithMagic = text.startsWith("#?RADIANCE") || text.startsWith("#?RGBE");
  if (!startsWithMagic) return false;
  // Require a valid Radiance FORMAT declaration within the header bytes.
  return /FORMAT\s*=\s*32-bit_rle_(?:rgbe|xyze)/i.test(text);
}

export async function probeHdrImage({ file, signal }: ProbeViewerContext): Promise<ViewerSupportLevel> {
  if (file.size < 8) return 0;
  const header = await readBlob(file.slice(0, HDR_PROBE_BYTES), signal);
  if (isOpenExrHeader(header)) return 4;
  if (isRadianceHdrHeader(header)) return 4;
  return 0;
}
