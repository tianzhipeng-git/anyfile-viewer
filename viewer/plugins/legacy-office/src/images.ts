import { MAX_IMAGES, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES, type LegacyImage } from "./model";

export interface ImageCollector {
  readonly images: LegacyImage[];
  add(mimeType: string, bytes: Uint8Array, alt?: string): number | undefined;
}

export function createImageCollector(): ImageCollector {
  const images: LegacyImage[] = [];
  let totalBytes = 0;

  return {
    images,
    add(mimeType: string, bytes: Uint8Array, alt?: string): number | undefined {
      if (images.length >= MAX_IMAGES) return undefined;
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return undefined;
      if (totalBytes + bytes.byteLength > MAX_TOTAL_IMAGE_BYTES) return undefined;
      totalBytes += bytes.byteLength;
      const index = images.length;
      images.push({ mimeType, bytes, alt });
      return index;
    },
  };
}

/**
 * Wrap raw BITMAPINFOHEADER + pixel data (DIB) in a 14-byte BITMAPFILEHEADER
 * so browsers can display it natively as `image/bmp`.
 */
export function wrapDibAsBmp(dib: Uint8Array): Uint8Array | undefined {
  if (dib.byteLength < 40) return undefined;
  const view = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const headerSize = view.getUint32(0, true);
  if (headerSize < 12 || headerSize > dib.byteLength) return undefined;
  const bpp = headerSize === 12 ? view.getUint16(10, true) : view.getUint16(14, true);
  const colorsUsed = headerSize >= 36 ? view.getUint32(32, true) : 0;
  let paletteEntries = colorsUsed;
  if (paletteEntries === 0 && bpp > 0 && bpp <= 8) {
    paletteEntries = 1 << bpp;
  }
  const paletteBytes = paletteEntries * (headerSize === 12 ? 3 : 4);
  const pixelOffset = 14 + headerSize + paletteBytes;
  const totalSize = 14 + dib.byteLength;
  if (pixelOffset > totalSize) return undefined;

  const bmp = new Uint8Array(totalSize);
  const out = new DataView(bmp.buffer);
  bmp[0] = 0x42; // B
  bmp[1] = 0x4d; // M
  out.setUint32(2, totalSize, true);
  out.setUint32(10, pixelOffset, true);
  bmp.set(dib, 14);
  return bmp;
}

/**
 * Decode an OfficeArt Blip record (`0xF01A`..`0xF029`) starting at its 8-byte record header.
 * Returns normalized `{ mimeType, bytes }` for PNG, JPEG, GIF, and DIB/BMP.
 */
export function decodeOfficeArtBlip(buffer: Uint8Array, offset: number): { mimeType: string; bytes: Uint8Array } | undefined {
  if (offset + 8 > buffer.byteLength) return undefined;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const verInst = view.getUint16(offset, true);
  const recInst = verInst >>> 4;
  const recType = view.getUint16(offset + 2, true);
  const recLen = view.getUint32(offset + 4, true);
  const payloadStart = offset + 8;
  const payloadEnd = payloadStart + recLen;
  if (payloadEnd > buffer.byteLength || recLen > MAX_IMAGE_BYTES + 64) return undefined;

  // Raster blips: 0xF01D (JPEG), 0xF01E (PNG), 0xF01F (DIB), 0xF029 (TIFF), 0xF02A (JPEG CMYK)
  // For PNG/JPEG/DIB, 16-byte UID + optional 16-byte second UID if (recInst & 1) !== 0 + 1-byte tag (total 17 or 33 bytes).
  const isTwoUid = (typeBase: number) => (recInst ^ typeBase) === 1;

  if (recType === 0xf01e) {
    const headerLen = isTwoUid(0x6e0) ? 33 : 17;
    if (payloadStart + headerLen >= payloadEnd) return undefined;
    return { mimeType: "image/png", bytes: buffer.slice(payloadStart + headerLen, payloadEnd) };
  }
  if (recType === 0xf01d || recType === 0xf02a) {
    const headerLen = isTwoUid(0x46a) || isTwoUid(0x6e2) ? 33 : 17;
    if (payloadStart + headerLen >= payloadEnd) return undefined;
    return { mimeType: "image/jpeg", bytes: buffer.slice(payloadStart + headerLen, payloadEnd) };
  }
  if (recType === 0xf01f) {
    const headerLen = isTwoUid(0x7a8) ? 33 : 17;
    if (payloadStart + headerLen >= payloadEnd) return undefined;
    const bmp = wrapDibAsBmp(buffer.subarray(payloadStart + headerLen, payloadEnd));
    return bmp ? { mimeType: "image/bmp", bytes: bmp } : undefined;
  }
  return undefined;
}
