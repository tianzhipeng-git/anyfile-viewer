/** Test-only builders that attach a synthetic EXIF block to the real examples. */

const encoder = new TextEncoder();

function box(type: string, ...parts: Uint8Array[]) {
  const size = 8 + parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set(encoder.encode(type), 4);
  let at = 8;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

function u8(...values: number[]) {
  return new Uint8Array(values);
}

function u16(value: number) {
  return u8(value >> 8, value & 0xff);
}

function u32(value: number) {
  return u8(value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function children(bytes: Uint8Array, start: number, end: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { type: string; start: number; end: number }[] = [];
  for (let at = start; at < end;) {
    const size = view.getUint32(at);
    out.push({ type: String.fromCharCode(...bytes.subarray(at + 4, at + 8)), start: at, end: at + size });
    at += size;
  }
  return out;
}

/** Little-endian TIFF: Make/Model/Orientation, EXIF IFD (ISO, f-number, DateTimeOriginal) and a GPS IFD. */
export function buildExifTiff() {
  const out = new Uint8Array(256);
  const view = new DataView(out.buffer);
  out.set(encoder.encode("II"), 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  let data = 160;
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    view.setUint16(at, tag, true); view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true); view.setUint32(at + 8, value, true);
  };
  const text = (value: string) => { const at = data; out.set(encoder.encode(`${value}\0`), at); data += value.length + 1; return at; };
  view.setUint16(8, 5, true);
  entry(10, 0x010f, 2, 7, text("Anyfile"));
  entry(22, 0x0110, 2, 10, text("Test Cam 1"));
  entry(34, 0x0112, 3, 1, 6);
  entry(46, 0x8769, 4, 1, 80);
  entry(58, 0x8825, 4, 1, 140);
  view.setUint16(80, 3, true);
  entry(82, 0x8827, 3, 1, 400);
  const fNumber = data; view.setUint32(data, 28, true); view.setUint32(data + 4, 10, true); data += 8;
  entry(94, 0x829d, 5, 1, fNumber);
  entry(106, 0x9003, 2, 20, text("2024:05:06 07:08:09"));
  view.setUint16(140, 0, true);
  return out.subarray(0, data);
}

function exifPayload(tiff: Uint8Array) {
  const payload = new Uint8Array(4 + tiff.length);
  payload.set(tiff, 4);
  return payload;
}

/** Wraps a bare JPEG XL codestream in a container with a trailing `Exif` box. */
export function jxlWithExif(codestream: Uint8Array, tiff: Uint8Array) {
  const parts = [
    box("JXL ", u8(0x0d, 0x0a, 0x87, 0x0a)),
    box("ftyp", encoder.encode("jxl "), u32(0), encoder.encode("jxl ")),
    box("jxlc", codestream),
    box("Exif", exifPayload(tiff)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

/**
 * Adds an `Exif` item (cdsc → primary) to a single-item HEIF written by heif-enc
 * (iloc v0 with 4-byte offset/length/base sizes); its payload lives in a trailing `mdat`.
 */
export function heifWithExif(heif: Uint8Array, tiff: Uint8Array) {
  const view = new DataView(heif.buffer, heif.byteOffset, heif.byteLength);
  const top = children(heif, 0, heif.length);
  const meta = top.find((entry) => entry.type === "meta")!;
  const parts = children(heif, meta.start + 12, meta.end);
  const iloc = parts.find((entry) => entry.type === "iloc")!;
  const iinf = parts.find((entry) => entry.type === "iinf")!;
  const pitm = parts.find((entry) => entry.type === "pitm")!;
  const primary = view.getUint16(pitm.start + 12);
  const exifId = primary + 1;
  // Original single iloc entry: id(2) ref(2) base(4) count(2) offset(4) length(4).
  const entryAt = iloc.start + 16;
  const imageOffset = view.getUint32(entryAt + 4) + view.getUint32(entryAt + 10);
  const imageLength = view.getUint32(entryAt + 14);
  const payload = exifPayload(tiff);

  const build = (delta: number) => {
    const newIloc = box("iloc", u32(0), u8(0x44, 0x40), u16(2),
      u16(primary), u16(0), u32(0), u16(1), u32(imageOffset + delta), u32(imageLength),
      u16(exifId), u16(0), u32(0), u16(1), u32(heif.length + delta + 8), u32(payload.length));
    const infe = box("infe", u8(2, 0, 0, 0), u16(exifId), u16(0), encoder.encode("Exif"), u8(0));
    const oldInfes = heif.subarray(iinf.start + 14, iinf.end);
    const newIinf = box("iinf", u32(0), u16(2), oldInfes, infe);
    const iref = box("iref", u32(0), box("cdsc", u16(exifId), u16(1), u16(primary)));
    const rest = parts.filter((entry) => entry.type !== "iloc" && entry.type !== "iinf").map((entry) => heif.subarray(entry.start, entry.end));
    return box("meta", u32(0), ...rest.slice(0, 2), newIloc, newIinf, iref, ...rest.slice(2));
  };
  const newMeta = build(build(0).length - (meta.end - meta.start));
  const out = new Uint8Array(heif.length - (meta.end - meta.start) + newMeta.length + 8 + payload.length);
  let at = 0;
  for (const entry of top) {
    const bytes = entry.type === "meta" ? newMeta : heif.subarray(entry.start, entry.end);
    out.set(bytes, at);
    at += bytes.length;
  }
  out.set(box("mdat", payload), at);
  return out;
}
