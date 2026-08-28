export type RasterProbe = {
  readonly format: "TGA" | "PNM" | "TIFF" | "BigTIFF";
  readonly supportLevel: 3 | 4;
};

const TIFF_VERIFIED_COMPRESSIONS = new Set([1, 5, 7, 8, 32946, 32773]);
const TIFF_EXPERIMENTAL_COMPRESSIONS = new Set([34887, 50000, 50001]);
const TIFF_SUPPORTED_PHOTOMETRICS = new Set([0, 1, 2, 3, 5, 6, 8]);

function inspectTga(bytes: Uint8Array, fileSize: number): RasterProbe | undefined {
  if (bytes.length < 18) return undefined;
  const colorMapType = bytes[1];
  const imageType = bytes[2];
  const colorMapped = imageType === 1 || imageType === 9;
  const trueColor = imageType === 2 || imageType === 10;
  const grayscale = imageType === 3 || imageType === 11;
  if (!colorMapped && !trueColor && !grayscale) return undefined;
  if ((colorMapped && colorMapType !== 1) || (!colorMapped && colorMapType !== 0)) return undefined;
  const width = bytes[12] | (bytes[13] << 8);
  const height = bytes[14] | (bytes[15] << 8);
  const depth = bytes[16];
  if (!width || !height) return undefined;
  if (trueColor && ![15, 16, 24, 32].includes(depth)) return undefined;
  if (grayscale && ![8, 16].includes(depth)) return undefined;
  if (colorMapped && ![8, 16].includes(depth)) return undefined;
  const colorMapDepth = bytes[7];
  if (colorMapped && ![15, 16, 24, 32].includes(colorMapDepth)) return undefined;
  const dataOffset = 18 + bytes[0] + (colorMapType ? (bytes[5] | (bytes[6] << 8)) * Math.ceil(colorMapDepth / 8) : 0);
  if (dataOffset > fileSize) return undefined;
  if (imageType < 9) {
    const required = width * height * Math.ceil(depth / 8);
    if (!Number.isSafeInteger(required) || dataOffset + required > fileSize) return undefined;
  }
  return { format: "TGA", supportLevel: 4 };
}

function pnmToken(bytes: Uint8Array, state: { position: number }) {
  while (state.position < bytes.length) {
    if (bytes[state.position] === 0x23) {
      while (state.position < bytes.length && bytes[state.position] !== 0x0a && bytes[state.position] !== 0x0d) state.position += 1;
    } else if (bytes[state.position] <= 0x20) state.position += 1;
    else break;
  }
  const start = state.position;
  while (state.position < bytes.length && bytes[state.position] > 0x20 && bytes[state.position] !== 0x23) state.position += 1;
  return start === state.position ? undefined : String.fromCharCode(...bytes.subarray(start, state.position));
}

function inspectPnm(bytes: Uint8Array, fileSize: number): RasterProbe | undefined {
  if (bytes.length < 3 || bytes[0] !== 0x50 || bytes[1] < 0x31 || bytes[1] > 0x37) return undefined;
  const next = bytes[2];
  if (next !== 0x20 && next !== 0x09 && next !== 0x0a && next !== 0x0d && next !== 0x23) return undefined;
  const kind = bytes[1] - 0x30;
  if (kind === 7) {
    const header = new TextDecoder("ascii").decode(bytes);
    const end = header.indexOf("ENDHDR");
    if (end < 0) return undefined;
    const values = new Map(header.slice(2, end).split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
      const separator = line.search(/\s/);
      return [line.slice(0, separator), line.slice(separator).trim()];
    }));
    const width = Number(values.get("WIDTH"));
    const height = Number(values.get("HEIGHT"));
    const depth = Number(values.get("DEPTH"));
    const maximum = Number(values.get("MAXVAL"));
    const tuple = values.get("TUPLTYPE");
    const channelsByTuple: Record<string, number> = {
      BLACKANDWHITE: 1,
      GRAYSCALE: 1,
      RGB: 3,
      BLACKANDWHITE_ALPHA: 2,
      GRAYSCALE_ALPHA: 2,
      RGB_ALPHA: 4,
    };
    if (![width, height, depth, maximum].every(Number.isInteger) || width <= 0 || height <= 0 || ![1, 2, 3, 4].includes(depth) || maximum < 1 || maximum > 65535) return undefined;
    if (tuple !== undefined && channelsByTuple[tuple] !== depth) return undefined;
    const newline = header.indexOf("\n", end);
    if (newline < 0) return undefined;
    const expected = newline + 1 + width * height * depth * (maximum < 256 ? 1 : 2);
    if (!Number.isSafeInteger(expected) || expected !== fileSize) return undefined;
    return { format: "PNM", supportLevel: tuple === undefined ? 3 : 4 };
  }
  const state = { position: 0 };
  if (pnmToken(bytes, state) !== `P${kind}`) return undefined;
  const width = Number(pnmToken(bytes, state));
  const height = Number(pnmToken(bytes, state));
  const bitmap = kind === 1 || kind === 4;
  const maximum = bitmap ? 1 : Number(pnmToken(bytes, state));
  if (![width, height, maximum].every(Number.isInteger) || width <= 0 || height <= 0 || maximum < 1 || maximum > 65535) return undefined;
  if (kind >= 4) {
    if (state.position >= bytes.length || bytes[state.position] > 0x20) return undefined;
    if (bytes[state.position++] === 0x0d && bytes[state.position] === 0x0a) state.position += 1;
    const channels = kind === 6 ? 3 : 1;
    const dataBytes = kind === 4 ? Math.ceil(width / 8) * height : width * height * channels * (maximum < 256 ? 1 : 2);
    if (!Number.isSafeInteger(dataBytes) || state.position + dataBytes !== fileSize) return undefined;
  } else if (fileSize <= bytes.length) {
    const samples = width * height * (kind === 3 ? 3 : 1);
    if (!Number.isSafeInteger(samples) || samples > 64 * 1024 * 1024) return undefined;
    for (let index = 0; index < samples; index += 1) {
      let value: number;
      if (kind === 1) {
        while (state.position < bytes.length) {
          const byte = bytes[state.position];
          if (byte === 0x23) {
            while (state.position < bytes.length && bytes[state.position] !== 0x0a && bytes[state.position] !== 0x0d) state.position += 1;
          } else if (byte <= 0x20) state.position += 1;
          else break;
        }
        const byte = bytes[state.position++];
        value = byte === 0x30 ? 0 : byte === 0x31 ? 1 : Number.NaN;
      } else value = Number(pnmToken(bytes, state));
      if (!Number.isInteger(value) || value < 0 || value > maximum) return undefined;
    }
  }
  return { format: "PNM", supportLevel: 4 };
}

function tiffNumber(
  view: DataView,
  offset: number,
  byteLength: 2 | 4 | 8,
  littleEndian: boolean,
): number | undefined {
  if (offset < 0 || offset + byteLength > view.byteLength) return undefined;
  if (byteLength === 2) return view.getUint16(offset, littleEndian);
  if (byteLength === 4) return view.getUint32(offset, littleEndian);
  const value = view.getBigUint64(offset, littleEndian);
  return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : undefined;
}

function tiffShortValues(
  view: DataView,
  entry: number,
  big: boolean,
  littleEndian: boolean,
  type: number,
  count: number,
): number[] | undefined {
  if (type !== 3 || count < 1 || count > 64) return undefined;
  const inlineBytes = big ? 8 : 4;
  const valueField = entry + (big ? 12 : 8);
  const valueOffset = count * 2 <= inlineBytes
    ? valueField
    : tiffNumber(view, valueField, big ? 8 : 4, littleEndian);
  if (valueOffset === undefined) return undefined;
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = tiffNumber(view, valueOffset + index * 2, 2, littleEndian);
    if (value === undefined) return undefined;
    values.push(value);
  }
  return values;
}

function inspectTiff(bytes: Uint8Array): RasterProbe | undefined {
  if (bytes.length < 8) return undefined;
  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49;
  if (!littleEndian && !(bytes[0] === 0x4d && bytes[1] === 0x4d)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = tiffNumber(view, 2, 2, littleEndian);
  const big = version === 43;
  if (version !== 42 && !big) return undefined;
  if (big && (tiffNumber(view, 4, 2, littleEndian) !== 8 || tiffNumber(view, 6, 2, littleEndian) !== 0)) {
    return undefined;
  }
  const offsetSize = big ? 8 : 4;
  const firstIfd = tiffNumber(view, big ? 8 : 4, offsetSize, littleEndian);
  if (firstIfd === undefined || firstIfd === 0) return undefined;
  const countSize = big ? 8 : 2;
  const entrySize = big ? 20 : 12;
  const entryCount = tiffNumber(view, firstIfd, countSize, littleEndian);
  if (entryCount === undefined || entryCount > 4096) return undefined;

  let compression = 1;
  let photometric: number | undefined;
  let hasIcc = false;
  let hasGeoMetadata = false;
  let tiled = false;
  let sampleLayoutUncertain = false;
  let bitsPerSample = [1];
  let sampleFormats = [1];
  for (let index = 0; index < entryCount; index += 1) {
    const entry = firstIfd + countSize + index * entrySize;
    const tag = tiffNumber(view, entry, 2, littleEndian);
    const type = tiffNumber(view, entry + 2, 2, littleEndian);
    const count = tiffNumber(view, entry + 4, big ? 8 : 4, littleEndian);
    if (tag === undefined || type === undefined || count === undefined) return undefined;
    if (tag === 34675) hasIcc = true;
    if (tag === 33550 || tag === 33922 || tag === 34264 || tag === 34735 || tag === 34736 || tag === 34737) hasGeoMetadata = true;
    if (tag === 322 || tag === 324) tiled = true;
    if (tag === 258 || tag === 339) {
      const values = tiffShortValues(view, entry, big, littleEndian, type, count);
      if (!values) sampleLayoutUncertain = true;
      else if (tag === 258) bitsPerSample = values;
      else sampleFormats = values;
    }
    if ((tag === 259 || tag === 262) && count === 1 && type === 3) {
      const valueOffset = entry + (big ? 12 : 8);
      const value = tiffNumber(view, valueOffset, 2, littleEndian);
      if (value === undefined) return undefined;
      if (tag === 259) compression = value;
      else photometric = value;
    }
  }
  if (!TIFF_VERIFIED_COMPRESSIONS.has(compression) && !TIFF_EXPERIMENTAL_COMPRESSIONS.has(compression)) return undefined;
  if (photometric !== undefined && !TIFF_SUPPORTED_PHOTOMETRICS.has(photometric)) return undefined;
  if (bitsPerSample.some((value) => value < 1 || value > 16) || sampleFormats.some((value) => value !== 1)) return undefined;
  const partial = big || hasIcc || hasGeoMetadata || sampleLayoutUncertain || TIFF_EXPERIMENTAL_COMPRESSIONS.has(compression) || (tiled && compression === 7);
  return { format: big ? "BigTIFF" : "TIFF", supportLevel: partial ? 3 : 4 };
}

export function inspectRasterHeader(bytes: Uint8Array, fileSize: number): RasterProbe | undefined {
  return inspectPnm(bytes, fileSize) ?? inspectTiff(bytes) ?? inspectTga(bytes, fileSize);
}
