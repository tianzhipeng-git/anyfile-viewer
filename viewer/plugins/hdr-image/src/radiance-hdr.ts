import { ViewerError } from "@anyfile/viewer-protocol";
import { computeDynamicRange, isLikelyEquirectangular } from "./tone-map";
import {
  MAX_HDR_EDGE,
  MAX_HDR_PIXELS,
  type HdrAovLayer,
  type HdrDecodedFrame,
  type HdrMetadataEntry,
  type HdrPartSummary,
} from "./types";

const MAX_HEADER_BYTES = 65_536;

interface ParsedResolution {
  readonly width: number;
  readonly height: number;
  readonly majorAxis: "X" | "Y";
  readonly majorSign: 1 | -1;
  readonly minorSign: 1 | -1;
  readonly scanlineLength: number;
  readonly scanlineCount: number;
}

function readAsciiLine(bytes: Uint8Array, offset: number): { line: string; nextOffset: number } | null {
  if (offset >= bytes.byteLength) return null;
  let end = offset;
  while (end < bytes.byteLength && bytes[end] !== 0x0a) {
    end++;
    if (end - offset > 4096) {
      throw new ViewerError("invalid-file", "Radiance HDR header line exceeds maximum length.");
    }
  }
  const lineEnd = end > offset && bytes[end - 1] === 0x0d ? end - 1 : end;
  const line = new TextDecoder("ascii").decode(bytes.subarray(offset, lineEnd));
  const nextOffset = end < bytes.byteLength ? end + 1 : end;
  return { line, nextOffset };
}

function parseResolutionLine(line: string): ParsedResolution {
  const match = /^\s*([+-])([XY])\s+(\d+)\s+([+-])([XY])\s+(\d+)\s*$/.exec(line);
  if (!match) {
    throw new ViewerError("invalid-file", "Invalid Radiance HDR resolution string.");
  }
  const majorSign = match[1] === "+" ? 1 : -1;
  const majorAxis = match[2] as "X" | "Y";
  const majorLen = Number.parseInt(match[3], 10);
  const minorSign = match[4] === "+" ? 1 : -1;
  const minorAxis = match[5] as "X" | "Y";
  const minorLen = Number.parseInt(match[6], 10);

  if (majorAxis === minorAxis || !Number.isFinite(majorLen) || !Number.isFinite(minorLen) || majorLen <= 0 || minorLen <= 0) {
    throw new ViewerError("invalid-file", "Invalid Radiance HDR dimensions.");
  }

  const width = majorAxis === "Y" ? minorLen : majorLen;
  const height = majorAxis === "Y" ? majorLen : minorLen;

  if (width > MAX_HDR_EDGE || height > MAX_HDR_EDGE || width * height > MAX_HDR_PIXELS) {
    throw new ViewerError(
      "resource-limit",
      `HDR image dimensions (${width}×${height}) exceed the viewing budget.`,
    );
  }

  return {
    width,
    height,
    majorAxis,
    majorSign,
    minorSign,
    scanlineLength: minorLen,
    scanlineCount: majorLen,
  };
}

function decodeScanline(
  bytes: Uint8Array,
  offset: number,
  scanlineLength: number,
  outRgbe: Uint8Array,
): number {
  if (offset + 4 > bytes.byteLength) {
    throw new ViewerError("invalid-file", "Unexpected end of Radiance HDR pixel data.");
  }

  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];

  // Adaptive new-style RLE: 2, 2, hi(len), lo(len)
  const isNewRle =
    scanlineLength >= 8 &&
    scanlineLength <= 0x7fff &&
    b0 === 2 &&
    b1 === 2 &&
    ((b2 << 8) | b3) === scanlineLength;

  if (isNewRle) {
    let pos = offset + 4;
    for (let ch = 0; ch < 4; ch++) {
      let x = 0;
      while (x < scanlineLength) {
        if (pos >= bytes.byteLength) {
          throw new ViewerError("invalid-file", "Truncated Radiance HDR RLE scanline.");
        }
        const code = bytes[pos++];
        if (code > 128) {
          const count = code - 128;
          if (x + count > scanlineLength || pos >= bytes.byteLength) {
            throw new ViewerError("invalid-file", "Corrupt Radiance HDR RLE run.");
          }
          const value = bytes[pos++];
          for (let k = 0; k < count; k++) {
            outRgbe[(x + k) * 4 + ch] = value;
          }
          x += count;
        } else {
          const count = code;
          if (count === 0 || x + count > scanlineLength || pos + count > bytes.byteLength) {
            throw new ViewerError("invalid-file", "Corrupt Radiance HDR RLE literal run.");
          }
          for (let k = 0; k < count; k++) {
            outRgbe[(x + k) * 4 + ch] = bytes[pos++];
          }
          x += count;
        }
      }
    }
    return pos;
  }

  // Uncompressed or old-style RLE
  let pos = offset;
  let x = 0;
  let rShift = 0;
  while (x < scanlineLength) {
    if (pos + 4 > bytes.byteLength) {
      throw new ViewerError("invalid-file", "Truncated Radiance HDR scanline.");
    }
    const r = bytes[pos++];
    const g = bytes[pos++];
    const b = bytes[pos++];
    const e = bytes[pos++];

    if (r === 1 && g === 1 && b === 1 && x > 0) {
      const count = e << rShift;
      if (x + count > scanlineLength) {
        throw new ViewerError("invalid-file", "Corrupt Radiance HDR old-style RLE run.");
      }
      const prevIdx = (x - 1) * 4;
      const pr = outRgbe[prevIdx];
      const pg = outRgbe[prevIdx + 1];
      const pb = outRgbe[prevIdx + 2];
      const pe = outRgbe[prevIdx + 3];
      for (let k = 0; k < count; k++) {
        const dst = (x + k) * 4;
        outRgbe[dst] = pr;
        outRgbe[dst + 1] = pg;
        outRgbe[dst + 2] = pb;
        outRgbe[dst + 3] = pe;
      }
      x += count;
      rShift += 8;
    } else {
      const dst = x * 4;
      outRgbe[dst] = r;
      outRgbe[dst + 1] = g;
      outRgbe[dst + 2] = b;
      outRgbe[dst + 3] = e;
      x++;
      rShift = 0;
    }
  }
  return pos;
}

export function decodeRadianceHdr(bytes: Uint8Array): HdrDecodedFrame {
  let offset = 0;
  const first = readAsciiLine(bytes, offset);
  if (!first || (!first.line.startsWith("#?RADIANCE") && !first.line.startsWith("#?RGBE"))) {
    throw new ViewerError("invalid-file", "Not a valid Radiance HDR file.");
  }
  offset = first.nextOffset;

  let format: "rgbe" | "xyze" | null = null;
  const metadata: HdrMetadataEntry[] = [];

  while (offset < bytes.byteLength && offset < MAX_HEADER_BYTES) {
    const next = readAsciiLine(bytes, offset);
    if (!next) break;
    offset = next.nextOffset;
    const trimmed = next.line.trim();
    if (trimmed === "") break;
    if (trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      const upperKey = key.toUpperCase();
      if (upperKey === "FORMAT") {
        if (/32-bit_rle_rgbe/i.test(value)) format = "rgbe";
        else if (/32-bit_rle_xyze/i.test(value)) format = "xyze";
        else throw new ViewerError("invalid-file", `Unsupported Radiance HDR format: ${value}`);
      }
      metadata.push({ key, value });
    }
  }

  if (!format) {
    throw new ViewerError("invalid-file", "Missing Radiance HDR FORMAT header.");
  }

  const resLine = readAsciiLine(bytes, offset);
  if (!resLine) {
    throw new ViewerError("invalid-file", "Missing Radiance HDR resolution line.");
  }
  offset = resLine.nextOffset;
  const res = parseResolutionLine(resLine.line);

  const rgba = new Float32Array(res.width * res.height * 4);
  const scanlineBuf = new Uint8Array(res.scanlineLength * 4);

  for (let major = 0; major < res.scanlineCount; major++) {
    offset = decodeScanline(bytes, offset, res.scanlineLength, scanlineBuf);
    for (let minor = 0; minor < res.scanlineLength; minor++) {
      const srcIdx = minor * 4;
      const e = scanlineBuf[srcIdx + 3];
      let c0 = 0;
      let c1 = 0;
      let c2 = 0;
      if (e > 0) {
        const scale = Math.pow(2, e - 136);
        c0 = (scanlineBuf[srcIdx] + 0.5) * scale;
        c1 = (scanlineBuf[srcIdx + 1] + 0.5) * scale;
        c2 = (scanlineBuf[srcIdx + 2] + 0.5) * scale;
      }

      let r = c0;
      let g = c1;
      let b = c2;
      if (format === "xyze") {
        // CIE XYZ -> linear Rec.709 / sRGB
        r = 3.2404542 * c0 - 1.5371385 * c1 - 0.4985314 * c2;
        g = -0.9692660 * c0 + 1.8760108 * c1 + 0.0415560 * c2;
        b = 0.0556434 * c0 - 0.2040259 * c1 + 1.0572252 * c2;
      }

      let x: number;
      let y: number;
      if (res.majorAxis === "Y") {
        y = res.majorSign < 0 ? major : res.height - 1 - major;
        x = res.minorSign > 0 ? minor : res.width - 1 - minor;
      } else {
        x = res.majorSign > 0 ? major : res.width - 1 - major;
        y = res.minorSign < 0 ? minor : res.height - 1 - minor;
      }

      const dstIdx = (y * res.width + x) * 4;
      rgba[dstIdx] = r;
      rgba[dstIdx + 1] = g;
      rgba[dstIdx + 2] = b;
      rgba[dstIdx + 3] = 1.0;
    }
  }

  const layer: HdrAovLayer = {
    id: "rgb",
    label: format === "xyze" ? "RGB (from XYZE)" : "RGB",
    channels: ["R", "G", "B"],
    kind: "rgb",
    hasAlpha: false,
  };
  const part: HdrPartSummary = {
    index: 0,
    name: "Image",
    width: res.width,
    height: res.height,
    compression: "RLE",
    tiled: false,
    layers: [layer],
    channelCount: 3,
  };

  return {
    format: "radiance-hdr",
    width: res.width,
    height: res.height,
    partIndex: 0,
    layerId: "rgb",
    hasAlpha: false,
    isEquirectangular: isLikelyEquirectangular(res.width, res.height),
    parts: [part],
    metadata,
    dynamicRange: computeDynamicRange(rgba, res.width, res.height),
    rgba,
  };
}
