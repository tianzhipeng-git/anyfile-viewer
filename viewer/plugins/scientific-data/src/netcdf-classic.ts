import { ViewerError } from "@anyfile/viewer-protocol";
import type {
  AttributeItem,
  ContainerFormat,
  ContainerSummary,
  DatasetInfo,
  DimensionInfo,
  GroupInfo,
  HeatmapRequest,
  HeatmapResult,
  ScientificDataSource,
  SliceRequest,
  SliceResult,
  TreeNode,
} from "./types";
import { formatScalarValue, totalElementsOf } from "./types";

const MAX_HEADER_BYTES = 32 * 1024 * 1024;
const MAX_DIMS = 4_096;
const MAX_VARS = 16_384;
const MAX_ATTRS = 4_096;
const MAX_SLICE_CELLS = 100_000;
const MAX_SLICE_READ_BYTES = 16 * 1024 * 1024;

const NC_DIMENSION = 0x0a;
const NC_VARIABLE = 0x0b;
const NC_ATTRIBUTE = 0x0c;

type NcTypeInfo = { readonly name: string; readonly size: number; readonly numeric: boolean };

const NC_TYPES: Record<number, NcTypeInfo> = {
  1: { name: "int8", size: 1, numeric: true },
  2: { name: "char", size: 1, numeric: false },
  3: { name: "int16", size: 2, numeric: true },
  4: { name: "int32", size: 4, numeric: true },
  5: { name: "float32", size: 4, numeric: true },
  6: { name: "float64", size: 8, numeric: true },
  7: { name: "uint8", size: 1, numeric: true },
  8: { name: "uint16", size: 2, numeric: true },
  9: { name: "uint32", size: 4, numeric: true },
  10: { name: "int64", size: 8, numeric: true },
  11: { name: "uint64", size: 8, numeric: true },
};

type NcVariable = {
  readonly name: string;
  readonly dimIds: readonly number[];
  readonly dimNames: readonly string[];
  readonly shape: readonly number[];
  readonly attributes: readonly AttributeItem[];
  readonly ncType: number;
  readonly typeInfo: NcTypeInfo;
  readonly vsize: number;
  readonly begin: number;
  readonly isRecord: boolean;
};

const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

class NeedMoreBytesError extends Error {}

class NetCdfCursor {
  offset = 0;
  private readonly view: DataView;
  constructor(
    private readonly bytes: Uint8Array,
    private readonly isV5: boolean,
  ) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private ensure(n: number) {
    if (this.offset + n > this.bytes.length) throw new NeedMoreBytesError();
  }
  u32(): number {
    this.ensure(4);
    const v = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return v;
  }
  u64(): number {
    this.ensure(8);
    const big = this.view.getBigUint64(this.offset, false);
    this.offset += 8;
    const num = Number(big);
    if (!Number.isSafeInteger(num)) {
      throw new ViewerError("resource-limit", "NetCDF 64-bit offset exceeds safe integer range");
    }
    return num;
  }
  nonNeg(): number {
    return this.isV5 ? this.u64() : this.u32();
  }
  readPaddedBytes(len: number): Uint8Array {
    if (len < 0 || len > MAX_HEADER_BYTES) {
      throw new ViewerError("invalid-file", "Invalid NetCDF header length");
    }
    const padded = Math.ceil(len / 4) * 4;
    this.ensure(padded);
    const slice = this.bytes.subarray(this.offset, this.offset + len);
    this.offset += padded;
    return slice;
  }
  readName(): string {
    const len = this.nonNeg();
    const raw = this.readPaddedBytes(len);
    return utf8Decoder.decode(raw);
  }
}

function readTypedValue(view: DataView, offset: number, ncType: number): number | bigint | string {
  switch (ncType) {
    case 1: return view.getInt8(offset);
    case 2: return String.fromCharCode(view.getUint8(offset));
    case 3: return view.getInt16(offset, false);
    case 4: return view.getInt32(offset, false);
    case 5: return view.getFloat32(offset, false);
    case 6: return view.getFloat64(offset, false);
    case 7: return view.getUint8(offset);
    case 8: return view.getUint16(offset, false);
    case 9: return view.getUint32(offset, false);
    case 10: return view.getBigInt64(offset, false);
    case 11: return view.getBigUint64(offset, false);
    default: return Number.NaN;
  }
}

function parseAttributes(cursor: NetCdfCursor): AttributeItem[] {
  const tag = cursor.u32();
  const count = cursor.nonNeg();
  if (tag === 0 && count === 0) return [];
  if (tag !== NC_ATTRIBUTE) {
    throw new ViewerError("invalid-file", `Unexpected NetCDF attribute tag: ${tag}`);
  }
  if (count > MAX_ATTRS) {
    throw new ViewerError("resource-limit", "NetCDF attribute count exceeds limit");
  }
  const attrs: AttributeItem[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = cursor.readName();
    const ncType = cursor.u32();
    const nelems = cursor.nonNeg();
    const typeInfo = NC_TYPES[ncType];
    if (!typeInfo) {
      throw new ViewerError("invalid-file", `Unknown NetCDF attribute type: ${ncType}`);
    }
    const byteLen = nelems * typeInfo.size;
    const raw = cursor.readPaddedBytes(byteLen);
    let preview: string;
    if (ncType === 2) {
      const text = utf8Decoder.decode(raw).replace(/\0+$/, "");
      preview = text.length > 160 ? `${text.slice(0, 157)}…` : text;
    } else {
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const shown = Math.min(nelems, 12);
      const items: string[] = [];
      for (let j = 0; j < shown; j += 1) {
        items.push(formatScalarValue(readTypedValue(view, j * typeInfo.size, ncType)));
      }
      preview = nelems === 1
        ? (items[0] ?? "—")
        : `[${items.join(", ")}${nelems > shown ? `, … (${nelems})` : ""}]`;
    }
    attrs.push({
      name,
      dtype: typeInfo.name,
      shape: nelems === 1 ? [] : [nelems],
      preview,
    });
  }
  return attrs;
}

type ParsedHeader = {
  readonly version: 1 | 2 | 5;
  readonly numrecs: number;
  readonly dimensions: readonly DimensionInfo[];
  readonly globalAttributes: readonly AttributeItem[];
  readonly variables: readonly NcVariable[];
  readonly recordStride: number;
};

function parseHeaderBytes(bytes: Uint8Array, fileSize: number): ParsedHeader {
  if (bytes.length < 8) throw new NeedMoreBytesError();
  if (bytes[0] !== 0x43 || bytes[1] !== 0x44 || bytes[2] !== 0x46) {
    throw new ViewerError("invalid-file", "Not a NetCDF Classic/64-bit/CDF-5 file");
  }
  const versionByte = bytes[3];
  if (versionByte !== 1 && versionByte !== 2 && versionByte !== 5) {
    throw new ViewerError("invalid-file", `Unsupported NetCDF version: ${versionByte}`);
  }
  const version = versionByte as 1 | 2 | 5;
  const isV5 = version === 5;
  const cursor = new NetCdfCursor(bytes, isV5);
  cursor.offset = 4;
  const numrecs = cursor.nonNeg();

  // Dimensions
  const dimTag = cursor.u32();
  const dimCount = cursor.nonNeg();
  const dimensions: DimensionInfo[] = [];
  if (dimTag === NC_DIMENSION) {
    if (dimCount > MAX_DIMS) throw new ViewerError("resource-limit", "NetCDF dimension count exceeds limit");
    for (let i = 0; i < dimCount; i += 1) {
      const name = cursor.readName();
      const len = cursor.nonNeg();
      const unlimited = len === 0;
      dimensions.push({ name, size: unlimited ? numrecs : len, unlimited });
    }
  } else if (dimTag !== 0 || dimCount !== 0) {
    throw new ViewerError("invalid-file", "Invalid NetCDF dimension list");
  }

  // Global attributes
  const globalAttributes = parseAttributes(cursor);

  // Variables
  const varTag = cursor.u32();
  const varCount = cursor.nonNeg();
  const variables: NcVariable[] = [];
  let recordStride = 0;
  if (varTag === NC_VARIABLE) {
    if (varCount > MAX_VARS) throw new ViewerError("resource-limit", "NetCDF variable count exceeds limit");
    for (let i = 0; i < varCount; i += 1) {
      const name = cursor.readName();
      const ndims = cursor.nonNeg();
      const dimIds: number[] = [];
      const dimNames: string[] = [];
      const shape: number[] = [];
      for (let d = 0; d < ndims; d += 1) {
        const id = cursor.u32();
        const dim = dimensions[id];
        if (!dim) throw new ViewerError("invalid-file", `Invalid NetCDF dimension index ${id}`);
        dimIds.push(id);
        dimNames.push(dim.name);
        shape.push(dim.size);
      }
      const attributes = parseAttributes(cursor);
      const ncType = cursor.u32();
      const typeInfo = NC_TYPES[ncType];
      if (!typeInfo) throw new ViewerError("invalid-file", `Unknown NetCDF variable type: ${ncType}`);
      const vsize = cursor.nonNeg();
      const begin = version === 1 ? cursor.u32() : cursor.u64();
      if (begin > fileSize) {
        throw new ViewerError("invalid-file", `NetCDF variable "${name}" starts past end of file`);
      }
      const isRecord = dimIds.length > 0 && Boolean(dimensions[dimIds[0]]?.unlimited);
      if (isRecord) recordStride += vsize;
      variables.push({ name, dimIds, dimNames, shape, attributes, ncType, typeInfo, vsize, begin, isRecord });
    }
  } else if (varTag !== 0 || varCount !== 0) {
    throw new ViewerError("invalid-file", "Invalid NetCDF variable list");
  }

  return { version, numrecs, dimensions, globalAttributes, variables, recordStride };
}

function computeStrides(shape: readonly number[]): number[] {
  const strides = new Array<number>(shape.length);
  let stride = 1;
  for (let i = shape.length - 1; i >= 0; i -= 1) {
    strides[i] = stride;
    stride *= Math.max(1, shape[i]);
  }
  return strides;
}

function byteOffsetForCoords(
  variable: NcVariable,
  coords: readonly number[],
  strides: readonly number[],
  recordStride: number,
): number {
  if (variable.shape.length === 0) return variable.begin;
  if (variable.isRecord) {
    const recIndex = coords[0] ?? 0;
    let inner = 0;
    for (let i = 1; i < coords.length; i += 1) inner += coords[i] * strides[i];
    return variable.begin + recIndex * recordStride + inner * variable.typeInfo.size;
  }
  let flat = 0;
  for (let i = 0; i < coords.length; i += 1) flat += coords[i] * strides[i];
  return variable.begin + flat * variable.typeInfo.size;
}

async function readValuesAtOffsets(
  file: Blob,
  variable: NcVariable,
  offsets: readonly number[],
  signal?: AbortSignal,
): Promise<(number | bigint | string)[]> {
  if (offsets.length === 0) return [];
  const elemSize = variable.typeInfo.size;
  let minOff = Number.POSITIVE_INFINITY;
  let maxOff = 0;
  for (const off of offsets) {
    if (off < minOff) minOff = off;
    if (off + elemSize > maxOff) maxOff = off + elemSize;
  }
  if (maxOff > file.size) {
    throw new ViewerError("invalid-file", `NetCDF variable "${variable.name}" data is truncated`);
  }
  // If bounding span is small enough, read in one contiguous Blob.slice; otherwise read per row/point.
  if (maxOff - minOff <= MAX_SLICE_READ_BYTES) {
    signal?.throwIfAborted();
    const buf = await file.slice(minOff, maxOff).arrayBuffer();
    const view = new DataView(buf);
    return offsets.map((off) => readTypedValue(view, off - minOff, variable.ncType));
  }
  // Group into nearby chunks (e.g. contiguous runs) to avoid excessive slices.
  const results = new Array<number | bigint | string>(offsets.length);
  for (let i = 0; i < offsets.length; i += 1) {
    signal?.throwIfAborted();
    const off = offsets[i];
    const buf = await file.slice(off, off + elemSize).arrayBuffer();
    results[i] = readTypedValue(new DataView(buf), 0, variable.ncType);
  }
  return results;
}

export async function openNetCdfClassicSource(
  file: Blob,
  signal: AbortSignal,
): Promise<ScientificDataSource> {
  let headerBytes = Math.min(file.size, 65_536);
  let parsed: ParsedHeader | undefined;
  while (true) {
    signal.throwIfAborted();
    const buffer = await file.slice(0, headerBytes).arrayBuffer();
    try {
      parsed = parseHeaderBytes(new Uint8Array(buffer), file.size);
      break;
    } catch (error) {
      if (error instanceof NeedMoreBytesError) {
        if (headerBytes >= file.size || headerBytes >= MAX_HEADER_BYTES) {
          throw new ViewerError("invalid-file", "NetCDF header is truncated or exceeds 32 MiB limit");
        }
        headerBytes = Math.min(file.size, MAX_HEADER_BYTES, headerBytes * 4);
        continue;
      }
      throw error;
    }
  }

  const format: ContainerFormat =
    parsed.version === 1 ? "netcdf-classic" : parsed.version === 2 ? "netcdf-64bit" : "netcdf-cdf5";
  const formatDetail =
    parsed.version === 1
      ? "NetCDF Classic (CDF-1)"
      : parsed.version === 2
        ? "NetCDF 64-bit Offset (CDF-2)"
        : "NetCDF 64-bit Data (CDF-5)";

  const varMap = new Map<string, NcVariable>();
  const rootChildren: TreeNode[] = parsed.variables.map((v) => {
    const path = `/${v.name}`;
    varMap.set(path, v);
    return { path, name: v.name, kind: "dataset", shape: v.shape, dtype: v.typeInfo.name };
  });

  const summary: ContainerSummary = {
    format,
    formatDetail,
    fileSize: file.size,
    rootChildren,
    rootAttributes: parsed.globalAttributes,
    dimensions: parsed.dimensions,
  };

  return {
    summary,
    async listGroup(path: string): Promise<GroupInfo> {
      if (path !== "/" && path !== "") {
        throw new ViewerError("invalid-file", `Group not found: ${path}`);
      }
      return { path: "/", name: "/", children: rootChildren, attributes: parsed.globalAttributes };
    },
    async inspectDataset(path: string): Promise<DatasetInfo> {
      const v = varMap.get(path);
      if (!v) throw new ViewerError("invalid-file", `Variable not found: ${path}`);
      return {
        path,
        name: v.name,
        dtype: v.typeInfo.name,
        shape: v.shape,
        totalElements: totalElementsOf(v.shape),
        isNumeric: v.typeInfo.numeric,
        isString: v.ncType === 2,
        order: "C",
        attributes: v.attributes,
        dimensionNames: v.dimNames,
      };
    },
    async readSlice(req: SliceRequest, reqSignal?: AbortSignal): Promise<SliceResult> {
      const v = varMap.get(req.path);
      if (!v) throw new ViewerError("invalid-file", `Variable not found: ${req.path}`);
      const strides = computeStrides(v.shape);
      if (v.shape.length === 0) {
        const vals = await readValuesAtOffsets(file, v, [v.begin], reqSignal);
        return {
          values: [formatScalarValue(vals[0])],
          rows: 1,
          cols: 1,
          rowOffset: 0,
          colOffset: 0,
          totalRows: 1,
          totalCols: 1,
        };
      }
      if (v.shape.length === 1) {
        const totalRows = v.shape[0];
        const rowOffset = Math.max(0, Math.min(req.rowOffset, totalRows));
        const rows = Math.max(0, Math.min(req.rowCount, totalRows - rowOffset));
        const offsets: number[] = [];
        for (let r = 0; r < rows; r += 1) {
          offsets.push(byteOffsetForCoords(v, [rowOffset + r], strides, parsed.recordStride));
        }
        const vals = await readValuesAtOffsets(file, v, offsets, reqSignal);
        return {
          values: vals.map((val) => formatScalarValue(val)),
          rows,
          cols: 1,
          rowOffset,
          colOffset: 0,
          totalRows,
          totalCols: 1,
        };
      }
      const rowAxis = Math.max(0, Math.min(req.rowAxis, v.shape.length - 1));
      const colAxis = req.colAxis === rowAxis
        ? (rowAxis === 0 ? 1 : 0)
        : Math.max(0, Math.min(req.colAxis, v.shape.length - 1));
      const totalRows = v.shape[rowAxis];
      const totalCols = v.shape[colAxis];
      const rowOffset = Math.max(0, Math.min(req.rowOffset, totalRows));
      const colOffset = Math.max(0, Math.min(req.colOffset, totalCols));
      const rows = Math.max(0, Math.min(req.rowCount, totalRows - rowOffset));
      const cols = Math.max(0, Math.min(req.colCount, totalCols - colOffset));
      if (rows * cols > MAX_SLICE_CELLS) {
        throw new ViewerError("resource-limit", "Requested NetCDF slice exceeds cell limit");
      }
      const coords = v.shape.map((dim, axis) => Math.max(0, Math.min(req.fixedIndices[axis] ?? 0, Math.max(0, dim - 1))));
      const offsets: number[] = [];
      for (let r = 0; r < rows; r += 1) {
        coords[rowAxis] = rowOffset + r;
        for (let c = 0; c < cols; c += 1) {
          coords[colAxis] = colOffset + c;
          offsets.push(byteOffsetForCoords(v, coords, strides, parsed.recordStride));
        }
      }
      const vals = await readValuesAtOffsets(file, v, offsets, reqSignal);
      return {
        values: vals.map((val) => formatScalarValue(val)),
        rows,
        cols,
        rowOffset,
        colOffset,
        totalRows,
        totalCols,
      };
    },
    async readHeatmap(req: HeatmapRequest, reqSignal?: AbortSignal): Promise<HeatmapResult> {
      const v = varMap.get(req.path);
      if (!v || v.shape.length < 2) throw new ViewerError("invalid-file", "Heatmap requires at least a 2D variable");
      const strides = computeStrides(v.shape);
      const rowAxis = Math.max(0, Math.min(req.rowAxis, v.shape.length - 1));
      const colAxis = req.colAxis === rowAxis
        ? (rowAxis === 0 ? 1 : 0)
        : Math.max(0, Math.min(req.colAxis, v.shape.length - 1));
      const sourceRows = v.shape[rowAxis];
      const sourceCols = v.shape[colAxis];
      const maxDim = Math.max(16, Math.min(req.maxDim, 512));
      const strideRow = Math.max(1, Math.ceil(sourceRows / maxDim));
      const strideCol = Math.max(1, Math.ceil(sourceCols / maxDim));
      const height = Math.ceil(sourceRows / strideRow);
      const width = Math.ceil(sourceCols / strideCol);
      const coords = v.shape.map((dim, axis) => Math.max(0, Math.min(req.fixedIndices[axis] ?? 0, Math.max(0, dim - 1))));
      const offsets: number[] = [];
      for (let r = 0; r < height; r += 1) {
        coords[rowAxis] = r * strideRow;
        for (let c = 0; c < width; c += 1) {
          coords[colAxis] = c * strideCol;
          offsets.push(byteOffsetForCoords(v, coords, strides, parsed.recordStride));
        }
      }
      const vals = await readValuesAtOffsets(file, v, offsets, reqSignal);
      const data = new Float64Array(height * width);
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let finiteCount = 0;
      for (let i = 0; i < vals.length; i += 1) {
        const num = typeof vals[i] === "string" ? Number.NaN : Number(vals[i]);
        data[i] = num;
        if (Number.isFinite(num)) {
          if (num < min) min = num;
          if (num > max) max = num;
          finiteCount += 1;
        }
      }
      if (finiteCount === 0) {
        min = 0;
        max = 0;
      }
      return { width, height, data, min, max, finiteCount, strideRow, strideCol, sourceRows, sourceCols };
    },
    dispose() {},
  };
}
