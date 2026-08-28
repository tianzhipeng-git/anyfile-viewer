export type BrowserImageFormat = "JPEG" | "PNG" | "APNG" | "GIF" | "WebP" | "AVIF";

export interface ImageFileInfo {
  readonly format: BrowserImageFormat;
  readonly width?: number;
  readonly height?: number;
  readonly animated: boolean;
  readonly frameCount?: number;
  readonly hasAlpha?: boolean;
  readonly orientation?: number;
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function u16be(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u32be(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function u24le(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function u32le(bytes: Uint8Array, offset: number) {
  return (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + ((bytes[offset + 3] << 24) >>> 0)) >>> 0;
}

function u64be(bytes: Uint8Array, offset: number) {
  const high = u32be(bytes, offset);
  const low = u32be(bytes, offset + 4);
  const value = high * 2 ** 32 + low;
  return Number.isSafeInteger(value) ? value : undefined;
}

function jpegOrientation(bytes: Uint8Array, offset: number, length: number) {
  if (length < 14 || ascii(bytes, offset, 6) !== "Exif\0\0") return undefined;
  const tiff = offset + 6;
  const littleEndian = ascii(bytes, tiff, 2) === "II";
  if (!littleEndian && ascii(bytes, tiff, 2) !== "MM") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read16 = (position: number) => view.getUint16(position, littleEndian);
  const read32 = (position: number) => view.getUint32(position, littleEndian);
  if (read16(tiff + 2) !== 42) return undefined;
  const directory = tiff + read32(tiff + 4);
  if (directory + 2 > offset + length) return undefined;
  const entryCount = read16(directory);
  for (let index = 0; index < entryCount; index += 1) {
    const entry = directory + 2 + index * 12;
    if (entry + 12 > offset + length) return undefined;
    if (read16(entry) === 0x0112 && read16(entry + 2) === 3 && read32(entry + 4) === 1) {
      const value = read16(entry + 8);
      return value >= 1 && value <= 8 ? value : undefined;
    }
  }
  return undefined;
}

function inspectJpeg(bytes: Uint8Array, complete: boolean): ImageFileInfo | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  let width: number | undefined;
  let height: number | undefined;
  let orientation: number | undefined;
  while (offset + 4 <= bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = u16be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    const dataOffset = offset + 2;
    const dataLength = segmentLength - 2;
    if (marker === 0xe1) orientation ??= jpegOrientation(bytes, dataOffset, dataLength);
    const isStartOfFrame = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isStartOfFrame && dataLength >= 5) {
      height = u16be(bytes, dataOffset + 1);
      width = u16be(bytes, dataOffset + 3);
    }
    offset += segmentLength;
  }
  return complete && (!width || !height)
    ? undefined
    : { format: "JPEG", width, height, animated: false, hasAlpha: false, orientation };
}

function inspectPng(bytes: Uint8Array, complete: boolean): ImageFileInfo | undefined {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return undefined;
  let offset = 8;
  let width: number | undefined;
  let height: number | undefined;
  let hasAlpha: boolean | undefined;
  let frameCount: number | undefined;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const next = offset + 12 + length;
    if (length > bytes.length || next > bytes.length) break;
    if (type === "IHDR" && length === 13) {
      width = u32be(bytes, offset + 8);
      height = u32be(bytes, offset + 12);
      hasAlpha = bytes[offset + 17] === 4 || bytes[offset + 17] === 6;
    } else if (type === "acTL" && length === 8) {
      frameCount = u32be(bytes, offset + 8);
    } else if (type === "tRNS") {
      hasAlpha = true;
    } else if (type === "IEND") {
      sawEnd = true;
      break;
    }
    offset = next;
  }
  if (!width || !height || (complete && !sawEnd)) return undefined;
  return {
    format: frameCount ? "APNG" : "PNG",
    width,
    height,
    animated: Boolean(frameCount && frameCount > 1),
    frameCount,
    hasAlpha,
  };
}

function skipGifSubBlocks(bytes: Uint8Array, initialOffset: number) {
  let offset = initialOffset;
  while (offset < bytes.length) {
    const length = bytes[offset++];
    if (length === 0) return offset;
    offset += length;
    if (offset > bytes.length) return -1;
  }
  return -1;
}

function inspectGif(bytes: Uint8Array, complete: boolean): ImageFileInfo | undefined {
  if (bytes.length < 13 || !["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) return undefined;
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  const packed = bytes[10];
  let offset = 13 + ((packed & 0x80) ? 3 * (2 ** ((packed & 7) + 1)) : 0);
  let frameCount = 0;
  let sawTrailer = false;
  let hasAlpha = false;
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) {
      sawTrailer = true;
      break;
    }
    if (marker === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9 && bytes[offset] === 4) hasAlpha ||= Boolean(bytes[offset + 1] & 1);
      offset = skipGifSubBlocks(bytes, offset);
    } else if (marker === 0x2c) {
      frameCount += 1;
      if (offset + 9 > bytes.length) return complete ? undefined : { format: "GIF", width, height, animated: frameCount > 1, frameCount, hasAlpha };
      const imagePacked = bytes[offset + 8];
      offset += 9 + ((imagePacked & 0x80) ? 3 * (2 ** ((imagePacked & 7) + 1)) : 0);
      offset += 1;
      offset = skipGifSubBlocks(bytes, offset);
    } else {
      return complete ? undefined : { format: "GIF", width, height, animated: frameCount > 1, frameCount, hasAlpha };
    }
    if (offset < 0) return complete ? undefined : { format: "GIF", width, height, animated: frameCount > 1, frameCount, hasAlpha };
  }
  if (!frameCount || (complete && !sawTrailer)) return undefined;
  return { format: "GIF", width, height, animated: frameCount > 1, frameCount, hasAlpha };
}

function webpDimensions(bytes: Uint8Array, type: string, offset: number) {
  if (type === "VP8X" && offset + 10 <= bytes.length) {
    return { width: u24le(bytes, offset + 4) + 1, height: u24le(bytes, offset + 7) + 1 };
  }
  if (type === "VP8L" && offset + 5 <= bytes.length && bytes[offset] === 0x2f) {
    const bits = u32le(bytes, offset + 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (type === "VP8 " && offset + 10 <= bytes.length && bytes[offset + 3] === 0x9d && bytes[offset + 4] === 0x01 && bytes[offset + 5] === 0x2a) {
    return { width: (bytes[offset + 6] | (bytes[offset + 7] << 8)) & 0x3fff, height: (bytes[offset + 8] | (bytes[offset + 9] << 8)) & 0x3fff };
  }
  return undefined;
}

function inspectWebp(bytes: Uint8Array, complete: boolean): ImageFileInfo | undefined {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return undefined;
  const declaredLength = u32le(bytes, 4) + 8;
  if (complete && declaredLength > bytes.length) return undefined;
  let offset = 12;
  let width: number | undefined;
  let height: number | undefined;
  let hasAlpha = false;
  let animated = false;
  let frameCount = 0;
  while (offset + 8 <= bytes.length && offset < declaredLength) {
    const type = ascii(bytes, offset, 4);
    const length = u32le(bytes, offset + 4);
    const dataOffset = offset + 8;
    const next = dataOffset + length + (length % 2);
    if (next > bytes.length) break;
    const dimensions = webpDimensions(bytes, type, dataOffset);
    width ??= dimensions?.width;
    height ??= dimensions?.height;
    if (type === "VP8X") {
      hasAlpha ||= Boolean(bytes[dataOffset] & 0x10);
      animated ||= Boolean(bytes[dataOffset] & 0x02);
    }
    if (type === "VP8L" && length >= 5) hasAlpha ||= Boolean(u32le(bytes, dataOffset + 1) & 0x10000000);
    if (type === "ALPH") hasAlpha = true;
    if (type === "ANMF") frameCount += 1;
    offset = next;
  }
  if (!width || !height || (complete && offset < declaredLength)) return undefined;
  return { format: "WebP", width, height, animated, frameCount: frameCount || undefined, hasAlpha };
}

function hasCompleteAvifContainer(bytes: Uint8Array) {
  let offset = 0;
  let sawMeta = false;
  while (offset + 8 <= bytes.length) {
    const size32 = u32be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const headerLength = size32 === 1 ? 16 : 8;
    if (offset + headerLength > bytes.length) return false;
    const size = size32 === 0
      ? bytes.length - offset
      : size32 === 1
        ? u64be(bytes, offset + 8)
        : size32;
    if (size === undefined || size < headerLength || offset + size > bytes.length) return false;
    sawMeta ||= type === "meta";
    offset += size;
  }
  return offset === bytes.length && sawMeta;
}

function inspectAvif(bytes: Uint8Array, complete: boolean): ImageFileInfo | undefined {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return undefined;
  const boxLength = u32be(bytes, 0);
  if (boxLength < 16 || boxLength > bytes.length) return undefined;
  const brands = [ascii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= boxLength; offset += 4) brands.push(ascii(bytes, offset, 4));
  if (!brands.includes("avif") && !brands.includes("avis")) return undefined;
  if (complete && !hasCompleteAvifContainer(bytes)) return undefined;
  // AVIF uses `avis` in the major or compatible brands to signal an image sequence.
  return { format: "AVIF", animated: brands.includes("avis") };
}

export function inspectImageFile(bytes: Uint8Array, complete = false): ImageFileInfo | undefined {
  return inspectJpeg(bytes, complete)
    ?? inspectPng(bytes, complete)
    ?? inspectGif(bytes, complete)
    ?? inspectWebp(bytes, complete)
    ?? inspectAvif(bytes, complete);
}
