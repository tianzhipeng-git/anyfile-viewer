import { ViewerError } from "@anyfile/viewer-protocol";
import {
  MAX_EXR_CHANNELS,
  MAX_HDR_EDGE,
  MAX_HDR_PIXELS,
  type HdrAovLayer,
  type HdrMetadataEntry,
} from "./types";

export const EXR_COMPRESSION_NAMES: Record<number, string> = {
  0: "None",
  1: "RLE",
  2: "ZIPS",
  3: "ZIP",
  4: "PIZ",
  5: "PXR24",
  6: "B44",
  7: "B44A",
  8: "DWAA",
  9: "DWAB",
};

export const EXR_LINES_PER_BLOCK: Record<number, number> = {
  0: 1,
  1: 1,
  2: 1,
  3: 16,
  4: 32,
  5: 16,
  6: 32,
  7: 32,
  8: 32,
  9: 256,
};

export interface ExrChannel {
  readonly name: string;
  readonly pixelType: 0 | 1 | 2;
  readonly byteSize: 2 | 4;
  readonly pLinear: number;
  readonly xSampling: number;
  readonly ySampling: number;
}

export interface ExrTileDesc {
  readonly xSize: number;
  readonly ySize: number;
  readonly levelMode: number;
  readonly roundingMode: number;
}

export interface ResolvedLayer {
  readonly info: HdrAovLayer;
  readonly rChannel?: string;
  readonly gChannel?: string;
  readonly bChannel?: string;
  readonly aChannel?: string;
  readonly isYryby?: boolean;
}

export interface ExrPartHeader {
  readonly index: number;
  readonly name: string;
  readonly type: string;
  readonly tiled: boolean;
  readonly compression: number;
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
  readonly width: number;
  readonly height: number;
  readonly channels: readonly ExrChannel[];
  readonly tiles?: ExrTileDesc;
  readonly envmap?: "latlong" | "cube";
  readonly chunkCount: number;
  readonly layers: readonly ResolvedLayer[];
  readonly metadata: readonly HdrMetadataEntry[];
}

function readCString(bytes: Uint8Array, offset: number, maxLen: number): { text: string; nextOffset: number } {
  let end = offset;
  const limit = Math.min(bytes.byteLength, offset + maxLen + 1);
  while (end < limit && bytes[end] !== 0) end++;
  if (end >= bytes.byteLength || bytes[end] !== 0) {
    throw new ViewerError("invalid-file", "Unterminated string in OpenEXR header.");
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(offset, end));
  return { text, nextOffset: end + 1 };
}

function numTileLevels(size: number, roundingMode: number): number {
  let n = 1;
  let s = size;
  while (s > 1) {
    s = roundingMode === 0 ? Math.floor(s / 2) : Math.ceil(s / 2);
    n++;
  }
  return n;
}

function computeTileChunkCount(width: number, height: number, tiles: ExrTileDesc): number {
  if (tiles.levelMode === 0) {
    return Math.ceil(width / tiles.xSize) * Math.ceil(height / tiles.ySize);
  }
  const lx = numTileLevels(width, tiles.roundingMode);
  const ly = numTileLevels(height, tiles.roundingMode);
  const levelDim = (dim: number, level: number) => {
    let s = dim;
    for (let i = 0; i < level; i++) {
      s = Math.max(1, tiles.roundingMode === 0 ? Math.floor(s / 2) : Math.ceil(s / 2));
    }
    return s;
  };
  let total = 0;
  if (tiles.levelMode === 1) {
    const levels = Math.max(lx, ly);
    for (let l = 0; l < levels; l++) {
      total += Math.ceil(levelDim(width, l) / tiles.xSize) * Math.ceil(levelDim(height, l) / tiles.ySize);
    }
  } else {
    for (let yL = 0; yL < ly; yL++) {
      for (let xL = 0; xL < lx; xL++) {
        total += Math.ceil(levelDim(width, xL) / tiles.xSize) * Math.ceil(levelDim(height, yL) / tiles.ySize);
      }
    }
  }
  return total;
}

function buildAovLayers(channels: readonly ExrChannel[]): ResolvedLayer[] {
  const byName = new Map(channels.map((ch) => [ch.name, ch]));
  const layers: ResolvedLayer[] = [];
  const used = new Set<string>();

  if (byName.has("R") || byName.has("G") || byName.has("B")) {
    const r = byName.has("R") ? "R" : undefined;
    const g = byName.has("G") ? "G" : undefined;
    const b = byName.has("B") ? "B" : undefined;
    const a = byName.has("A") ? "A" : undefined;
    const list = [r, g, b, a].filter((x): x is string => Boolean(x));
    list.forEach((n) => used.add(n));
    layers.push({
      info: { id: "beauty", label: a ? "RGBA (Beauty)" : "RGB (Beauty)", channels: list, kind: a ? "rgba" : "rgb", hasAlpha: Boolean(a) },
      rChannel: r, gChannel: g, bChannel: b, aChannel: a,
    });
  } else if (byName.has("Y") && byName.has("RY") && byName.has("BY")) {
    const a = byName.has("A") ? "A" : undefined;
    const list = ["Y", "RY", "BY", ...(a ? ["A"] : [])];
    list.forEach((n) => used.add(n));
    layers.push({
      info: { id: "beauty", label: a ? "Y/RY/BY + A" : "Y/RY/BY", channels: list, kind: a ? "rgba" : "rgb", hasAlpha: Boolean(a) },
      rChannel: "RY", gChannel: "Y", bChannel: "BY", aChannel: a, isYryby: true,
    });
  } else if (byName.has("Y")) {
    const a = byName.has("A") ? "A" : undefined;
    used.add("Y");
    if (a) used.add(a);
    layers.push({
      info: { id: "beauty", label: "Luminance (Y)", channels: a ? ["Y", "A"] : ["Y"], kind: "scalar", hasAlpha: Boolean(a) },
      rChannel: "Y", gChannel: "Y", bChannel: "Y", aChannel: a,
    });
  }

  const groups = new Map<string, Map<string, string>>();
  for (const ch of channels) {
    if (used.has(ch.name)) continue;
    const dot = ch.name.lastIndexOf(".");
    if (dot > 0 && dot < ch.name.length - 1) {
      const prefix = ch.name.slice(0, dot);
      const suffix = ch.name.slice(dot + 1);
      let map = groups.get(prefix);
      if (!map) {
        map = new Map();
        groups.set(prefix, map);
      }
      map.set(suffix.toUpperCase(), ch.name);
    }
  }

  for (const [prefix, map] of groups) {
    const hasRgb = map.has("R") || map.has("G") || map.has("B") || map.has("RED") || map.has("GREEN") || map.has("BLUE");
    const hasXyz = map.has("X") || map.has("Y") || map.has("Z");
    if (hasRgb && map.size >= 2) {
      const r = map.get("R") ?? map.get("RED");
      const g = map.get("G") ?? map.get("GREEN");
      const b = map.get("B") ?? map.get("BLUE");
      const a = map.get("A") ?? map.get("ALPHA");
      const list = [r, g, b, a].filter((x): x is string => Boolean(x));
      list.forEach((n) => used.add(n));
      layers.push({
        info: { id: `layer:${prefix}`, label: prefix, channels: list, kind: a ? "rgba" : "rgb", hasAlpha: Boolean(a) },
        rChannel: r, gChannel: g, bChannel: b, aChannel: a,
      });
    } else if (hasXyz && map.size >= 2) {
      const r = map.get("X");
      const g = map.get("Y");
      const b = map.get("Z");
      const a = map.get("A") ?? map.get("W");
      const list = [r, g, b, a].filter((x): x is string => Boolean(x));
      list.forEach((n) => used.add(n));
      layers.push({
        info: { id: `layer:${prefix}`, label: `${prefix} (XYZ)`, channels: list, kind: "vector", hasAlpha: Boolean(a) },
        rChannel: r, gChannel: g, bChannel: b, aChannel: a,
      });
    }
  }

  for (const ch of channels) {
    if (used.has(ch.name)) continue;
    used.add(ch.name);
    layers.push({
      info: { id: `ch:${ch.name}`, label: ch.name, channels: [ch.name], kind: "scalar", hasAlpha: false },
      rChannel: ch.name, gChannel: ch.name, bChannel: ch.name,
    });
  }

  return layers;
}

export function parseExrPartHeader(
  bytes: Uint8Array,
  view: DataView,
  startOffset: number,
  partIndex: number,
  maxNameLen: number,
  defaultTiled: boolean,
): { header: ExrPartHeader; nextOffset: number } {
  let offset = startOffset;
  let channels: ExrChannel[] = [];
  let compression = 0;
  let xMin = 0, yMin = 0, xMax = -1, yMax = -1;
  let tiles: ExrTileDesc | undefined;
  let envmap: "latlong" | "cube" | undefined;
  let name = "";
  let type = defaultTiled ? "tiledimage" : "scanlineimage";
  let declaredChunkCount: number | undefined;
  const metadata: HdrMetadataEntry[] = [];

  while (offset < bytes.byteLength) {
    if (bytes[offset] === 0) {
      offset++;
      break;
    }
    const attrName = readCString(bytes, offset, maxNameLen);
    offset = attrName.nextOffset;
    const attrType = readCString(bytes, offset, maxNameLen);
    offset = attrType.nextOffset;
    if (offset + 4 > bytes.byteLength) throw new ViewerError("invalid-file", "Truncated OpenEXR attribute size.");
    const attrSize = view.getInt32(offset, true);
    offset += 4;
    if (attrSize < 0 || offset + attrSize > bytes.byteLength) {
      throw new ViewerError("invalid-file", `Invalid OpenEXR attribute size for “${attrName.text}”.`);
    }
    const attrEnd = offset + attrSize;

    if (attrName.text === "channels" && attrType.text === "chlist") {
      let cPos = offset;
      channels = [];
      while (cPos < attrEnd && bytes[cPos] !== 0) {
        if (channels.length >= MAX_EXR_CHANNELS) {
          throw new ViewerError("resource-limit", `OpenEXR channel count exceeds ${MAX_EXR_CHANNELS}.`);
        }
        const chName = readCString(bytes, cPos, maxNameLen);
        cPos = chName.nextOffset;
        if (cPos + 16 > attrEnd) throw new ViewerError("invalid-file", "Truncated OpenEXR channel descriptor.");
        const pixelType = view.getInt32(cPos, true);
        const pLinear = bytes[cPos + 4];
        const xSampling = view.getInt32(cPos + 8, true);
        const ySampling = view.getInt32(cPos + 12, true);
        cPos += 16;
        if (pixelType !== 0 && pixelType !== 1 && pixelType !== 2) {
          throw new ViewerError("invalid-file", `Unsupported OpenEXR pixel type ${pixelType}.`);
        }
        if (xSampling <= 0 || ySampling <= 0) throw new ViewerError("invalid-file", "Invalid OpenEXR channel sampling.");
        channels.push({ name: chName.text, pixelType, byteSize: pixelType === 1 ? 2 : 4, pLinear, xSampling, ySampling });
      }
    } else if (attrName.text === "compression" && attrSize >= 1) {
      compression = bytes[offset];
    } else if (attrName.text === "dataWindow" && attrSize >= 16) {
      xMin = view.getInt32(offset, true);
      yMin = view.getInt32(offset + 4, true);
      xMax = view.getInt32(offset + 8, true);
      yMax = view.getInt32(offset + 12, true);
    } else if (attrName.text === "tiles" && attrSize >= 9) {
      const xSize = view.getUint32(offset, true);
      const ySize = view.getUint32(offset + 4, true);
      const mode = bytes[offset + 8];
      if (xSize === 0 || ySize === 0) throw new ViewerError("invalid-file", "Invalid OpenEXR tile dimensions.");
      tiles = { xSize, ySize, levelMode: mode & 0x0f, roundingMode: (mode >>> 4) & 0x0f };
    } else if (attrName.text === "envmap" && attrSize >= 1) {
      envmap = bytes[offset] === 0 ? "latlong" : bytes[offset] === 1 ? "cube" : undefined;
    } else if (attrName.text === "name" && attrType.text === "string") {
      name = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(offset, attrEnd));
    } else if (attrName.text === "type" && attrType.text === "string") {
      type = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(offset, attrEnd));
    } else if (attrName.text === "chunkCount" && attrSize >= 4) {
      declaredChunkCount = view.getInt32(offset, true);
    } else if (attrType.text === "string" && attrSize <= 256) {
      const val = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(offset, attrEnd));
      if (val.trim()) metadata.push({ key: attrName.text, value: val.trim() });
    } else if (attrType.text === "float" && attrSize === 4) {
      metadata.push({ key: attrName.text, value: String(Number(view.getFloat32(offset, true).toPrecision(5))) });
    } else if (attrType.text === "int" && attrSize === 4) {
      metadata.push({ key: attrName.text, value: String(view.getInt32(offset, true)) });
    }

    offset = attrEnd;
  }

  if (channels.length === 0) throw new ViewerError("invalid-file", "OpenEXR header contains no channels.");
  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;
  if (width <= 0 || height <= 0) throw new ViewerError("invalid-file", "OpenEXR dataWindow has non-positive dimensions.");
  if (width > MAX_HDR_EDGE || height > MAX_HDR_EDGE || width * height > MAX_HDR_PIXELS) {
    throw new ViewerError("resource-limit", `OpenEXR dimensions (${width}×${height}) exceed the viewing budget.`);
  }

  const tiled = type === "tiledimage" || (defaultTiled && Boolean(tiles));
  const linesPerBlock = EXR_LINES_PER_BLOCK[compression] ?? 1;
  const chunkCount =
    declaredChunkCount !== undefined && declaredChunkCount >= 0
      ? declaredChunkCount
      : tiled && tiles
        ? computeTileChunkCount(width, height, tiles)
        : Math.ceil(height / linesPerBlock);

  return {
    header: {
      index: partIndex,
      name: name || (partIndex === 0 ? "Part 0" : `Part ${partIndex}`),
      type,
      tiled,
      compression,
      xMin, yMin, xMax, yMax, width, height,
      channels,
      tiles,
      envmap,
      chunkCount,
      layers: buildAovLayers(channels),
      metadata,
    },
    nextOffset: offset,
  };
}
