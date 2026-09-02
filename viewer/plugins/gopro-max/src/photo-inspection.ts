export interface GoProMaxPhotoInspection {
  readonly kind: "photo";
  readonly device: "MAX";
  readonly width: 5760;
  readonly height: 2880;
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function ascii(bytes: Uint8Array, start: number, length: number) {
  let value = "";
  const end = Math.min(bytes.length, start + length);
  for (let offset = start; offset < end && bytes[offset] !== 0; offset += 1) value += String.fromCharCode(bytes[offset]);
  return value.trim();
}

function inspectExif(bytes: Uint8Array, start: number, end: number) {
  if (end - start < 14 || ascii(bytes, start, 6) !== "Exif") return undefined;
  const tiff = start + 6;
  const order = ascii(bytes, tiff, 2);
  const littleEndian = order === "II";
  if (!littleEndian && order !== "MM") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => offset + 2 <= end ? view.getUint16(offset, littleEndian) : undefined;
  const u32 = (offset: number) => offset + 4 <= end ? view.getUint32(offset, littleEndian) : undefined;
  if (u16(tiff + 2) !== 42) return undefined;
  const firstIfdOffset = u32(tiff + 4);
  if (firstIfdOffset === undefined) return undefined;
  const ifd = tiff + firstIfdOffset;
  const count = u16(ifd);
  if (count === undefined || count > 512 || ifd + 2 + count * 12 > end) return undefined;
  let make: string | undefined;
  let model: string | undefined;
  for (let index = 0; index < count; index += 1) {
    const entry = ifd + 2 + index * 12;
    const tag = u16(entry);
    const type = u16(entry + 2);
    const valueCount = u32(entry + 4);
    if ((tag !== 0x010f && tag !== 0x0110) || type !== 2 || !valueCount || valueCount > 256) continue;
    const valueOffset = valueCount <= 4 ? entry + 8 : tiff + (u32(entry + 8) ?? Number.MAX_SAFE_INTEGER);
    if (valueOffset < tiff || valueOffset + valueCount > end) continue;
    if (tag === 0x010f) make = ascii(bytes, valueOffset, valueCount);
    else model = ascii(bytes, valueOffset, valueCount);
  }
  return { make, model };
}

export function inspectGoProMaxPhoto(bytes: Uint8Array): GoProMaxPhotoInspection | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  let width: number | undefined;
  let height: number | undefined;
  let make: string | undefined;
  let model: string | undefined;
  let equirectangular = false;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > bytes.length) return undefined;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return undefined;
    const payloadStart = offset + 2;
    const segmentEnd = offset + length;
    if (SOF_MARKERS.has(marker) && payloadStart + 5 <= segmentEnd) {
      height = bytes[payloadStart + 1] * 256 + bytes[payloadStart + 2];
      width = bytes[payloadStart + 3] * 256 + bytes[payloadStart + 4];
    } else if (marker === 0xe1) {
      const exif = inspectExif(bytes, payloadStart, segmentEnd);
      make ??= exif?.make;
      model ??= exif?.model;
      const xmp = new TextDecoder("latin1").decode(bytes.subarray(payloadStart, segmentEnd));
      equirectangular ||= xmp.includes("<GPano:ProjectionType>equirectangular</GPano:ProjectionType>")
        && xmp.includes("<GPano:UsePanoramaViewer>True</GPano:UsePanoramaViewer>");
    }
    offset = segmentEnd;
  }
  return width === 5760 && height === 2880 && make === "GoPro" && model === "GoPro Max" && equirectangular
    ? { kind: "photo", device: "MAX", width, height }
    : undefined;
}
