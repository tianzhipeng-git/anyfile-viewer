import { ViewerError } from "@anyfile/viewer-protocol";
import {
  decompressB44,
  decompressPiz,
  decompressPxr24,
  decompressRle,
  decompressZip,
  type ExrChannelLayout,
} from "./exr-compression";
import {
  EXR_COMPRESSION_NAMES,
  EXR_LINES_PER_BLOCK,
  parseExrPartHeader,
  type ExrPartHeader,
} from "./exr-header";
import { EXR_MAGIC } from "./probe";
import { computeDynamicRange, isLikelyEquirectangular } from "./tone-map";
import {
  MAX_EXR_PARTS,
  type HdrDecodedFrame,
  type HdrMetadataEntry,
  type HdrPartSummary,
} from "./types";

const HALF_TO_FLOAT = (() => {
  const lut = new Float32Array(65536);
  for (let h = 0; h < 65536; h++) {
    const sign = (h & 0x8000) !== 0 ? -1 : 1;
    const exp = (h >>> 10) & 0x1f;
    const mant = h & 0x3ff;
    if (exp === 0) lut[h] = sign * Math.pow(2, -14) * (mant / 1024);
    else if (exp === 31) lut[h] = mant === 0 ? sign * Infinity : Number.NaN;
    else lut[h] = sign * Math.pow(2, exp - 15) * (1 + mant / 1024);
  }
  return lut;
})();

function readUint64AsNumber(view: DataView, offset: number): number {
  return view.getUint32(offset + 4, true) * 0x100000000 + view.getUint32(offset, true);
}

function readSampleValue(chunkView: DataView, byteOffset: number, pixelType: 0 | 1 | 2): number {
  if (pixelType === 1) return HALF_TO_FLOAT[chunkView.getUint16(byteOffset, true)];
  if (pixelType === 2) return chunkView.getFloat32(byteOffset, true);
  return chunkView.getUint32(byteOffset, true);
}

function decompressChunk(
  compression: number,
  packed: Uint8Array,
  rawSize: number,
  layouts: readonly ExrChannelLayout[],
  linesInChunk: number,
): Uint8Array {
  switch (compression) {
    case 0:
      if (packed.byteLength < rawSize) throw new ViewerError("invalid-file", "Truncated uncompressed OpenEXR chunk.");
      return packed.subarray(0, rawSize);
    case 1:
      return decompressRle(packed, rawSize);
    case 2:
    case 3:
      return decompressZip(packed, rawSize);
    case 4:
      return decompressPiz(packed, rawSize, layouts);
    case 5:
      return decompressPxr24(packed, rawSize, layouts, linesInChunk);
    case 6:
    case 7:
      return decompressB44(packed, rawSize, layouts);
    default: {
      const label = EXR_COMPRESSION_NAMES[compression] ?? `code ${compression}`;
      throw new ViewerError("invalid-file", `OpenEXR compression “${label}” is not supported yet.`);
    }
  }
}

function countSampledLines(chunkY: number, linesInChunk: number, ySampling: number): number {
  if (ySampling === 1) return linesInChunk;
  let count = 0;
  for (let i = 0; i < linesInChunk; i++) {
    if ((chunkY + i) % ySampling === 0) count++;
  }
  return count;
}

export class ExrDocument {
  private readonly view: DataView;

  private constructor(
    private readonly bytes: Uint8Array,
    private readonly multiPart: boolean,
    private readonly parts: readonly ExrPartHeader[],
    private readonly offsetTables: readonly number[][],
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  static parse(bytes: Uint8Array): ExrDocument {
    if (bytes.byteLength < 12) throw new ViewerError("invalid-file", "File is too short to be an OpenEXR image.");
    if (bytes[0] !== EXR_MAGIC[0] || bytes[1] !== EXR_MAGIC[1] || bytes[2] !== EXR_MAGIC[2] || bytes[3] !== EXR_MAGIC[3]) {
      throw new ViewerError("invalid-file", "Invalid OpenEXR magic signature.");
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const versionField = view.getUint32(4, true);
    const version = versionField & 0xff;
    if (version !== 2) throw new ViewerError("invalid-file", `Unsupported OpenEXR version ${version}.`);

    const singleTiled = (versionField & 0x200) !== 0;
    const longNames = (versionField & 0x400) !== 0;
    const nonImage = (versionField & 0x800) !== 0;
    const multiPart = (versionField & 0x1000) !== 0;
    const maxNameLen = longNames ? 255 : 31;

    if (nonImage && !multiPart) throw new ViewerError("invalid-file", "OpenEXR deep-data images are not supported.");

    let offset = 8;
    const parts: ExrPartHeader[] = [];

    if (multiPart) {
      while (offset < bytes.byteLength && bytes[offset] !== 0) {
        if (parts.length >= MAX_EXR_PARTS) {
          throw new ViewerError("resource-limit", `OpenEXR part count exceeds ${MAX_EXR_PARTS}.`);
        }
        const parsed = parseExrPartHeader(bytes, view, offset, parts.length, maxNameLen, false);
        parts.push(parsed.header);
        offset = parsed.nextOffset;
      }
      if (offset < bytes.byteLength && bytes[offset] === 0) offset++;
    } else {
      const parsed = parseExrPartHeader(bytes, view, offset, 0, maxNameLen, singleTiled);
      parts.push(parsed.header);
      offset = parsed.nextOffset;
    }

    if (parts.length === 0) throw new ViewerError("invalid-file", "OpenEXR file contains no image parts.");

    const offsetTables: number[][] = [];
    for (const part of parts) {
      const tableBytes = part.chunkCount * 8;
      if (offset + tableBytes > bytes.byteLength) {
        throw new ViewerError("invalid-file", "Truncated OpenEXR chunk offset table.");
      }
      const table: number[] = new Array(part.chunkCount);
      for (let i = 0; i < part.chunkCount; i++) table[i] = readUint64AsNumber(view, offset + i * 8);
      offsetTables.push(table);
      offset += tableBytes;
    }

    return new ExrDocument(bytes, multiPart, parts, offsetTables);
  }

  getPartSummaries(): HdrPartSummary[] {
    return this.parts.map((part) => ({
      index: part.index,
      name: part.name,
      width: part.width,
      height: part.height,
      compression: EXR_COMPRESSION_NAMES[part.compression] ?? `Code ${part.compression}`,
      tiled: part.tiled,
      envmap: part.envmap,
      layers: part.layers.map((l) => l.info),
      channelCount: part.channels.length,
    }));
  }

  decodeLayer(partIndex: number, requestedLayerId?: string): HdrDecodedFrame {
    const part = this.parts[partIndex];
    if (!part) throw new ViewerError("invalid-file", `OpenEXR part #${partIndex} does not exist.`);
    if (part.type === "deepscanline" || part.type === "deeptile") {
      throw new ViewerError("invalid-file", "OpenEXR deep-data parts are not supported.");
    }
    const layer = (requestedLayerId ? part.layers.find((l) => l.info.id === requestedLayerId) : undefined) ?? part.layers[0];
    if (!layer) throw new ViewerError("invalid-file", "OpenEXR part contains no renderable layers.");

    const rgba = new Float32Array(part.width * part.height * 4);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 1.0;

    const channelIndexByName = new Map(part.channels.map((ch, idx) => [ch.name, idx]));
    const rIdx = layer.rChannel ? channelIndexByName.get(layer.rChannel) : undefined;
    const gIdx = layer.gChannel ? channelIndexByName.get(layer.gChannel) : undefined;
    const bIdx = layer.bChannel ? channelIndexByName.get(layer.bChannel) : undefined;
    const aIdx = layer.aChannel ? channelIndexByName.get(layer.aChannel) : undefined;

    const offsets = this.offsetTables[partIndex];
    if (part.tiled && part.tiles) {
      this.decodeTiledPart(part, offsets, rgba, rIdx, gIdx, bIdx, aIdx);
    } else {
      this.decodeScanlinePart(part, offsets, rgba, rIdx, gIdx, bIdx, aIdx);
    }

    if (layer.isYryby) {
      for (let i = 0; i < rgba.length; i += 4) {
        const ry = rgba[i], y = rgba[i + 1], by = rgba[i + 2];
        const r = (ry + 1) * y;
        const b = (by + 1) * y;
        rgba[i] = r;
        rgba[i + 1] = (y - r * 0.2126 - b * 0.0722) / 0.7152;
        rgba[i + 2] = b;
      }
    }

    const metadata: HdrMetadataEntry[] = [
      { key: "compression", value: EXR_COMPRESSION_NAMES[part.compression] ?? `Code ${part.compression}` },
      { key: "layout", value: part.tiled ? `Tiled (${part.tiles?.xSize}×${part.tiles?.ySize})` : "Scanline" },
      { key: "channels", value: part.channels.map((c) => c.name).join(", ") },
      ...(part.envmap ? [{ key: "envmap", value: part.envmap }] : []),
      ...part.metadata,
    ];

    return {
      format: "openexr",
      width: part.width,
      height: part.height,
      partIndex,
      layerId: layer.info.id,
      hasAlpha: layer.info.hasAlpha,
      isEquirectangular: isLikelyEquirectangular(part.width, part.height, part.envmap),
      parts: this.getPartSummaries(),
      metadata,
      dynamicRange: computeDynamicRange(rgba, part.width, part.height),
      rgba,
    };
  }

  private decodeScanlinePart(
    part: ExrPartHeader,
    offsets: readonly number[],
    rgba: Float32Array,
    rIdx?: number, gIdx?: number, bIdx?: number, aIdx?: number,
  ): void {
    const linesPerBlock = EXR_LINES_PER_BLOCK[part.compression] ?? 1;
    const partPrefixBytes = this.multiPart ? 4 : 0;

    for (const chunkOffset of offsets) {
      if (chunkOffset + partPrefixBytes + 8 > this.bytes.byteLength) {
        throw new ViewerError("invalid-file", "OpenEXR scanline chunk offset out of bounds.");
      }
      let pos = chunkOffset;
      if (this.multiPart) {
        if (this.view.getInt32(pos, true) !== part.index) continue;
        pos += 4;
      }
      const chunkY = this.view.getInt32(pos, true);
      const dataSize = this.view.getInt32(pos + 4, true);
      pos += 8;
      if (dataSize < 0 || pos + dataSize > this.bytes.byteLength) {
        throw new ViewerError("invalid-file", "Truncated OpenEXR scanline chunk payload.");
      }

      const startLine = chunkY - part.yMin;
      if (startLine < 0 || startLine >= part.height) continue;
      const linesInChunk = Math.min(linesPerBlock, part.height - startLine);

      const layouts: ExrChannelLayout[] = part.channels.map((ch) => ({
        pixelType: ch.pixelType,
        byteSize: ch.byteSize,
        nx: Math.ceil(part.width / ch.xSampling),
        ny: countSampledLines(chunkY, linesInChunk, ch.ySampling),
      }));
      const rawSize = layouts.reduce((acc, l) => acc + l.nx * l.ny * l.byteSize, 0);
      const raw = decompressChunk(part.compression, this.bytes.subarray(pos, pos + dataSize), rawSize, layouts, linesInChunk);
      const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

      let cursor = 0;
      for (let ly = 0; ly < linesInChunk; ly++) {
        const absY = chunkY + ly;
        for (let ci = 0; ci < part.channels.length; ci++) {
          const ch = part.channels[ci];
          if (absY % ch.ySampling !== 0) continue;
          const nx = layouts[ci].nx;
          const isTarget = ci === rIdx || ci === gIdx || ci === bIdx || ci === aIdx;
          if (isTarget) {
            for (let sx = 0; sx < nx; sx++) {
              const val = readSampleValue(rawView, cursor + sx * ch.byteSize, ch.pixelType);
              const xStart = sx * ch.xSampling;
              const xEnd = Math.min(part.width, xStart + ch.xSampling);
              const yEnd = Math.min(part.height, startLine + ly + ch.ySampling);
              for (let yy = startLine + ly; yy < yEnd; yy++) {
                const rowBase = yy * part.width;
                for (let xx = xStart; xx < xEnd; xx++) {
                  const dst = (rowBase + xx) * 4;
                  if (ci === rIdx) rgba[dst] = val;
                  if (ci === gIdx) rgba[dst + 1] = val;
                  if (ci === bIdx) rgba[dst + 2] = val;
                  if (ci === aIdx) rgba[dst + 3] = val;
                }
              }
            }
          }
          cursor += nx * ch.byteSize;
        }
      }
    }
  }

  private decodeTiledPart(
    part: ExrPartHeader,
    offsets: readonly number[],
    rgba: Float32Array,
    rIdx?: number, gIdx?: number, bIdx?: number, aIdx?: number,
  ): void {
    const tiles = part.tiles!;
    const partPrefixBytes = this.multiPart ? 4 : 0;

    for (const chunkOffset of offsets) {
      if (chunkOffset + partPrefixBytes + 20 > this.bytes.byteLength) {
        throw new ViewerError("invalid-file", "OpenEXR tile chunk offset out of bounds.");
      }
      let pos = chunkOffset;
      if (this.multiPart) {
        if (this.view.getInt32(pos, true) !== part.index) continue;
        pos += 4;
      }
      const tileX = this.view.getInt32(pos, true);
      const tileY = this.view.getInt32(pos + 4, true);
      const levelX = this.view.getInt32(pos + 8, true);
      const levelY = this.view.getInt32(pos + 12, true);
      const dataSize = this.view.getInt32(pos + 16, true);
      pos += 20;

      if (levelX !== 0 || levelY !== 0) continue;
      if (dataSize < 0 || pos + dataSize > this.bytes.byteLength) {
        throw new ViewerError("invalid-file", "Truncated OpenEXR tile payload.");
      }

      const startX = tileX * tiles.xSize;
      const startY = tileY * tiles.ySize;
      if (startX < 0 || startY < 0 || startX >= part.width || startY >= part.height) continue;
      const tileW = Math.min(tiles.xSize, part.width - startX);
      const tileH = Math.min(tiles.ySize, part.height - startY);

      const layouts: ExrChannelLayout[] = part.channels.map((ch) => ({
        pixelType: ch.pixelType,
        byteSize: ch.byteSize,
        nx: Math.ceil(tileW / ch.xSampling),
        ny: Math.ceil(tileH / ch.ySampling),
      }));
      const rawSize = layouts.reduce((acc, l) => acc + l.nx * l.ny * l.byteSize, 0);
      const raw = decompressChunk(part.compression, this.bytes.subarray(pos, pos + dataSize), rawSize, layouts, tileH);
      const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

      let cursor = 0;
      for (let ty = 0; ty < tileH; ty++) {
        for (let ci = 0; ci < part.channels.length; ci++) {
          const ch = part.channels[ci];
          if (ty % ch.ySampling !== 0) continue;
          const nx = layouts[ci].nx;
          const isTarget = ci === rIdx || ci === gIdx || ci === bIdx || ci === aIdx;
          if (isTarget) {
            for (let sx = 0; sx < nx; sx++) {
              const val = readSampleValue(rawView, cursor + sx * ch.byteSize, ch.pixelType);
              const xStart = startX + sx * ch.xSampling;
              const xEnd = Math.min(startX + tileW, xStart + ch.xSampling);
              const yStart = startY + ty;
              const yEnd = Math.min(startY + tileH, yStart + ch.ySampling);
              for (let yy = yStart; yy < yEnd; yy++) {
                const rowBase = yy * part.width;
                for (let xx = xStart; xx < xEnd; xx++) {
                  const dst = (rowBase + xx) * 4;
                  if (ci === rIdx) rgba[dst] = val;
                  if (ci === gIdx) rgba[dst + 1] = val;
                  if (ci === bIdx) rgba[dst + 2] = val;
                  if (ci === aIdx) rgba[dst + 3] = val;
                }
              }
            }
          }
          cursor += nx * ch.byteSize;
        }
      }
    }
  }
}
