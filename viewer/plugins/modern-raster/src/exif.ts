import type { JsonValue } from "@anyfile/viewer-protocol";

/** Small read-only EXIF (TIFF) summary: camera, capture settings, date, orientation and GPS presence. */
export type ExifSummary = Readonly<Record<string, JsonValue>>;

const MAX_IFD_ENTRIES = 512;
const EXIF_IFD = 0x8769;
const GPS_IFD = 0x8825;

const IFD0_TAGS: Readonly<Record<number, string>> = {
  0x010f: "make", 0x0110: "model", 0x0112: "orientation", 0x0131: "software", 0x0132: "modifyDate",
};
const EXIF_TAGS: Readonly<Record<number, string>> = {
  0x829a: "exposureTime", 0x829d: "fNumber", 0x8827: "iso", 0x9003: "dateTimeOriginal",
  0x920a: "focalLength", 0xa434: "lensModel", 0xa002: "pixelWidth", 0xa003: "pixelHeight",
};
const TYPE_SIZES: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

function round(value: number) {
  return Math.round(value * 1e4) / 1e4;
}

/** Parses a TIFF-structured EXIF block (starting at the `II`/`MM` byte-order mark). */
export function parseExifTiff(tiff: Uint8Array): ExifSummary | undefined {
  if (tiff.length < 8) return undefined;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const order = String.fromCharCode(tiff[0], tiff[1]);
  if (order !== "II" && order !== "MM") return undefined;
  const le = order === "II";
  if (view.getUint16(2, le) !== 42) return undefined;
  const out: Record<string, JsonValue> = {};
  const visited = new Set<number>();

  const value = (type: number, count: number, offset: number): JsonValue | undefined => {
    const size = (TYPE_SIZES[type] ?? 0) * count;
    if (size === 0) return undefined;
    const at = size <= 4 ? offset : view.getUint32(offset, le);
    if (at + size > tiff.length) return undefined;
    if (type === 2) {
      const text = new TextDecoder().decode(tiff.subarray(at, at + count)).replace(/\0[\s\S]*$/, "").trim();
      return text || undefined;
    }
    if (type === 3) return view.getUint16(at, le);
    if (type === 4) return view.getUint32(at, le);
    if (type === 9) return view.getInt32(at, le);
    if (type === 5 || type === 10) {
      const num = type === 5 ? view.getUint32(at, le) : view.getInt32(at, le);
      const den = type === 5 ? view.getUint32(at + 4, le) : view.getInt32(at + 4, le);
      return den === 0 ? undefined : round(num / den);
    }
    return undefined;
  };

  const walk = (ifd: number, names: Readonly<Record<number, string>>) => {
    if (visited.has(ifd) || ifd + 2 > tiff.length) return;
    visited.add(ifd);
    const count = view.getUint16(ifd, le);
    if (count > MAX_IFD_ENTRIES || ifd + 2 + count * 12 > tiff.length) return;
    for (let index = 0; index < count; index++) {
      const entry = ifd + 2 + index * 12;
      const tag = view.getUint16(entry, le);
      const type = view.getUint16(entry + 2, le);
      const valueCount = view.getUint32(entry + 4, le);
      if (tag === EXIF_IFD) walk(view.getUint32(entry + 8, le), EXIF_TAGS);
      else if (tag === GPS_IFD) out.gps = true;
      else if (names[tag]) {
        const parsed = value(type, valueCount, entry + 8);
        if (parsed !== undefined) out[names[tag]] = parsed;
      }
    }
  };

  try {
    walk(view.getUint32(4, le), IFD0_TAGS);
  } catch {
    // Truncated or malformed IFD: keep whatever was decoded so far.
  }
  if (!("gps" in out)) out.gps = false;
  return out;
}

/** HEIF `Exif` items and JXL `Exif` boxes prefix the TIFF block with a 4-byte offset. */
export function parseExifPayload(payload: Uint8Array): ExifSummary | undefined {
  if (payload.length < 4) return undefined;
  const skip = ((payload[0] << 24) | (payload[1] << 16) | (payload[2] << 8) | payload[3]) >>> 0;
  if (4 + skip >= payload.length) return undefined;
  let start = 4 + skip;
  // Some writers include the JPEG APP1 `Exif\0\0` header before the TIFF block.
  if (payload[start] === 0x45 && payload[start + 1] === 0x78 && payload[start + 4] === 0 && payload[start + 5] === 0) start += 6;
  return parseExifTiff(payload.subarray(start));
}
