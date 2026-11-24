import { ViewerError } from "@anyfile/viewer-protocol";
import {
  align8,
  isNumericMxClass,
  MAX_DECOMPRESSED_BYTES,
  MI_COMPRESSED,
  MI_DOUBLE,
  MI_INT16,
  MI_INT32,
  MI_MATRIX,
  MI_SINGLE,
  MI_UINT16,
  MI_UINT8,
  MX_CELL,
  MX_CHAR,
  MX_DOUBLE,
  MX_INT16,
  MX_INT32,
  MX_OBJECT,
  MX_SINGLE,
  MX_STRUCT,
  MX_UINT16,
  MX_UINT8,
  mxClassName,
  parseMatrixHeader,
  parseMatrixValue,
  readNumericElement,
  readTag,
  unzlibBounded,
  unzlibPrefix,
  type ParsedMatValue,
} from "./matlab-parse";
import type {
  AttributeItem,
  ContainerSummary,
  DatasetInfo,
  GroupInfo,
  HeatmapRequest,
  HeatmapResult,
  ScientificDataSource,
  SliceRequest,
  SliceResult,
  TreeNode,
} from "./types";
import { formatScalarValue, totalElementsOf } from "./types";

const MAX_TOP_VARIABLES = 10_000;
const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

type TopLevelEntry = {
  readonly name: string;
  readonly compressed: boolean;
  readonly fileOffset: number;
  readonly byteLength: number;
  readonly mxClass: number;
  readonly isComplex: boolean;
  readonly isLogical: boolean;
  readonly shape: readonly number[];
  parsed?: ParsedMatValue;
};

function fortranFlatIndex(coords: readonly number[], shape: readonly number[]): number {
  let idx = 0;
  let stride = 1;
  for (let i = 0; i < shape.length; i += 1) {
    idx += (coords[i] ?? 0) * stride;
    stride *= Math.max(1, shape[i]);
  }
  return idx;
}

function lookupSparse(
  sparse: NonNullable<ParsedMatValue["sparse"]>,
  row: number,
  col: number,
): { re: number; im: number } {
  const start = sparse.jc[col] ?? 0;
  const end = sparse.jc[col + 1] ?? start;
  for (let idx = start; idx < end; idx += 1) {
    if (sparse.ir[idx] === row) {
      return { re: sparse.pr[idx] ?? 0, im: sparse.pi ? (sparse.pi[idx] ?? 0) : 0 };
    }
  }
  return { re: 0, im: 0 };
}

function formatComplex(re: number | bigint, im: number | bigint): string {
  const imNum = Number(im);
  if (imNum === 0) return formatScalarValue(re);
  const sign = imNum >= 0 ? "+" : "-";
  return `${formatScalarValue(re)} ${sign} ${formatScalarValue(Math.abs(imNum))}i`;
}

function valueToTreeNode(path: string, name: string, val: ParsedMatValue): TreeNode {
  const isGroup = val.mxClass === MX_STRUCT || val.mxClass === MX_CELL || val.mxClass === MX_OBJECT;
  if (isGroup) {
    const count = val.children?.length ?? 0;
    return { path, name, kind: "group", shape: val.shape, dtype: mxClassName(val.mxClass, false, false), childCount: count, hasChildren: count > 0 };
  }
  return { path, name, kind: "dataset", shape: val.shape, dtype: mxClassName(val.mxClass, val.isLogical, val.isComplex) };
}

function sliceParsedValue(val: ParsedMatValue, req: SliceRequest): SliceResult {
  if (val.mxClass === MX_CHAR) {
    const rows = val.shape[0] ?? 1;
    const cols = val.shape[1] ?? (val.text?.length ?? 0);
    // MATLAB char matrices are stored column-major; reconstruct row strings.
    const text = val.text ?? "";
    const lines: string[] = [];
    if (rows <= 1) {
      lines.push(text);
    } else {
      for (let r = 0; r < rows; r += 1) {
        let line = "";
        for (let c = 0; c < cols; c += 1) {
          line += text[c * rows + r] ?? "";
        }
        lines.push(line);
      }
    }
    const rowOffset = Math.max(0, Math.min(req.rowOffset, lines.length));
    const count = Math.max(0, Math.min(req.rowCount, lines.length - rowOffset));
    return {
      values: lines.slice(rowOffset, rowOffset + count),
      rows: count,
      cols: 1,
      rowOffset,
      colOffset: 0,
      totalRows: lines.length,
      totalCols: 1,
    };
  }

  const shape = val.shape.length === 0 ? [1, 1] : val.shape.length === 1 ? [val.shape[0], 1] : val.shape;
  const rowAxis = Math.max(0, Math.min(req.rowAxis, shape.length - 1));
  const colAxis = req.colAxis === rowAxis
    ? (rowAxis === 0 ? 1 : 0)
    : Math.max(0, Math.min(req.colAxis, shape.length - 1));
  const totalRows = shape[rowAxis] ?? 0;
  const totalCols = shape[colAxis] ?? 0;
  const rowOffset = Math.max(0, Math.min(req.rowOffset, totalRows));
  const colOffset = Math.max(0, Math.min(req.colOffset, totalCols));
  const rows = Math.max(0, Math.min(req.rowCount, totalRows - rowOffset));
  const cols = Math.max(0, Math.min(req.colCount, totalCols - colOffset));

  const values: string[] = [];
  const coords = shape.map((dim, axis) => Math.max(0, Math.min(req.fixedIndices[axis] ?? 0, Math.max(0, dim - 1))));
  for (let r = 0; r < rows; r += 1) {
    coords[rowAxis] = rowOffset + r;
    for (let c = 0; c < cols; c += 1) {
      coords[colAxis] = colOffset + c;
      if (val.sparse) {
        const { re, im } = lookupSparse(val.sparse, coords[0] ?? 0, coords[1] ?? 0);
        values.push(val.isComplex ? formatComplex(re, im) : formatScalarValue(re));
      } else {
        const flat = fortranFlatIndex(coords, shape);
        const re = val.real?.[flat];
        if (re === undefined) {
          values.push("—");
        } else if (val.isLogical) {
          values.push(re ? "true" : "false");
        } else if (val.isComplex && val.imag) {
          values.push(formatComplex(re, val.imag[flat] ?? 0));
        } else {
          values.push(formatScalarValue(re));
        }
      }
    }
  }
  return { values, rows, cols, rowOffset, colOffset, totalRows, totalCols };
}

function heatmapParsedValue(val: ParsedMatValue, req: HeatmapRequest): HeatmapResult {
  const shape = val.shape;
  if (shape.length < 2) throw new ViewerError("invalid-file", "Heatmap requires at least a 2D array");
  const rowAxis = Math.max(0, Math.min(req.rowAxis, shape.length - 1));
  const colAxis = req.colAxis === rowAxis
    ? (rowAxis === 0 ? 1 : 0)
    : Math.max(0, Math.min(req.colAxis, shape.length - 1));
  const sourceRows = shape[rowAxis];
  const sourceCols = shape[colAxis];
  const maxDim = Math.max(16, Math.min(req.maxDim, 512));
  const strideRow = Math.max(1, Math.ceil(sourceRows / maxDim));
  const strideCol = Math.max(1, Math.ceil(sourceCols / maxDim));
  const height = Math.ceil(sourceRows / strideRow);
  const width = Math.ceil(sourceCols / strideCol);
  const data = new Float64Array(height * width);
  const coords = shape.map((dim, axis) => Math.max(0, Math.min(req.fixedIndices[axis] ?? 0, Math.max(0, dim - 1))));
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let finiteCount = 0;

  for (let r = 0; r < height; r += 1) {
    coords[rowAxis] = r * strideRow;
    for (let c = 0; c < width; c += 1) {
      coords[colAxis] = c * strideCol;
      let num: number;
      if (val.sparse) {
        const { re, im } = lookupSparse(val.sparse, coords[0] ?? 0, coords[1] ?? 0);
        num = val.isComplex ? Math.hypot(re, im) : re;
      } else {
        const flat = fortranFlatIndex(coords, shape);
        const re = Number(val.real?.[flat] ?? Number.NaN);
        num = val.isComplex && val.imag ? Math.hypot(re, Number(val.imag[flat] ?? 0)) : re;
      }
      data[r * width + c] = num;
      if (Number.isFinite(num)) {
        if (num < min) min = num;
        if (num > max) max = num;
        finiteCount += 1;
      }
    }
  }
  if (finiteCount === 0) {
    min = 0;
    max = 0;
  }
  return { width, height, data, min, max, finiteCount, strideRow, strideCol, sourceRows, sourceCols };
}

export async function openMatlabV5Source(file: Blob, signal: AbortSignal): Promise<ScientificDataSource> {
  if (file.size < 128) throw new ViewerError("invalid-file", "MATLAB Level 5 file is truncated");
  const headerBytes = new Uint8Array(await file.slice(0, 128).arrayBuffer());
  const e0 = headerBytes[126];
  const e1 = headerBytes[127];
  const littleEndian = e0 === 0x49 && e1 === 0x4d;
  if (!littleEndian && !(e0 === 0x4d && e1 === 0x49)) {
    throw new ViewerError("invalid-file", "Invalid MATLAB Level 5 endian indicator");
  }
  const description = utf8Decoder.decode(headerBytes.subarray(0, 116)).replace(/\0+$/, "").trim();

  const entries = new Map<string, TopLevelEntry>();
  const rootChildren: TreeNode[] = [];
  let offset = 128;
  let index = 0;

  while (offset + 8 <= file.size) {
    signal.throwIfAborted();
    if (index >= MAX_TOP_VARIABLES) {
      throw new ViewerError("resource-limit", "MATLAB file exceeds maximum variable count");
    }
    const tagBuf = new Uint8Array(await file.slice(offset, offset + 8).arrayBuffer());
    const tag = readTag(tagBuf, 0, littleEndian);
    const dataFileOffset = offset + 8;
    const endOffset = tag.dataType === MI_COMPRESSED ? dataFileOffset + tag.numBytes : dataFileOffset + align8(tag.numBytes);
    if (tag.numBytes === 0 && tag.dataType === 0) break;
    if (dataFileOffset + tag.numBytes > file.size) {
      throw new ViewerError("invalid-file", "Truncated MATLAB top-level element");
    }

    if (tag.dataType === MI_COMPRESSED || tag.dataType === MI_MATRIX) {
      let headerInfo;
      if (tag.dataType === MI_COMPRESSED) {
        const probeSlice = new Uint8Array(
          await file.slice(dataFileOffset, Math.min(dataFileOffset + tag.numBytes, dataFileOffset + 4096)).arrayBuffer(),
        );
        const prefix = unzlibPrefix(probeSlice, 1024);
        const innerTag = readTag(prefix, 0, littleEndian);
        if (innerTag.dataType !== MI_MATRIX) {
          offset = endOffset;
          continue;
        }
        headerInfo = parseMatrixHeader(prefix, innerTag.dataOffset, prefix.length, littleEndian);
      } else {
        const probeSlice = new Uint8Array(
          await file.slice(dataFileOffset, Math.min(dataFileOffset + tag.numBytes, dataFileOffset + 1024)).arrayBuffer(),
        );
        headerInfo = parseMatrixHeader(probeSlice, 0, probeSlice.length, littleEndian);
      }
      const varName = headerInfo.name || `var_${index}`;
      const uniqueName = entries.has(varName) ? `${varName}_${index}` : varName;
      const entry: TopLevelEntry = {
        name: uniqueName,
        compressed: tag.dataType === MI_COMPRESSED,
        fileOffset: offset,
        byteLength: (dataFileOffset + tag.numBytes) - offset,
        mxClass: headerInfo.mxClass,
        isComplex: headerInfo.isComplex,
        isLogical: headerInfo.isLogical,
        shape: headerInfo.shape,
      };
      entries.set(uniqueName, entry);
      const isGroup = entry.mxClass === MX_STRUCT || entry.mxClass === MX_CELL || entry.mxClass === MX_OBJECT;
      rootChildren.push({
        path: `/${uniqueName}`,
        name: uniqueName,
        kind: isGroup ? "group" : "dataset",
        shape: entry.shape,
        dtype: mxClassName(entry.mxClass, entry.isLogical, entry.isComplex),
        hasChildren: isGroup,
      });
      index += 1;
    }
    offset = endOffset;
  }

  const rootAttributes: AttributeItem[] = [
    ...(description ? [{ name: "header", dtype: "string", shape: [], preview: description }] : []),
    { name: "endian", dtype: "string", shape: [], preview: littleEndian ? "little-endian (IM)" : "big-endian (MI)" },
    { name: "variables", dtype: "int32", shape: [], preview: String(entries.size) },
  ];

  async function loadTopEntry(entry: TopLevelEntry, reqSignal?: AbortSignal): Promise<ParsedMatValue> {
    if (entry.parsed) return entry.parsed;
    reqSignal?.throwIfAborted();
    if (!entry.compressed && entry.byteLength > MAX_DECOMPRESSED_BYTES) {
      throw new ViewerError(
        "resource-limit",
        `MATLAB variable "${entry.name}" exceeds ${Math.round(MAX_DECOMPRESSED_BYTES / (1024 * 1024))} MiB limit`,
      );
    }
    const raw = new Uint8Array(await file.slice(entry.fileOffset, entry.fileOffset + entry.byteLength).arrayBuffer());
    const matrixBytes = entry.compressed ? unzlibBounded(raw.subarray(8), MAX_DECOMPRESSED_BYTES) : raw;
    const { value } = parseMatrixValue(matrixBytes, 0, littleEndian, 0);
    entry.parsed = value;
    return value;
  }

  async function resolvePath(path: string, reqSignal?: AbortSignal): Promise<ParsedMatValue> {
    const parts = path.split("/").filter(Boolean);
    if (parts.length === 0) throw new ViewerError("invalid-file", "Invalid MATLAB variable path");
    const entry = entries.get(parts[0]);
    if (!entry) throw new ViewerError("invalid-file", `Variable not found: ${path}`);
    let current = await loadTopEntry(entry, reqSignal);
    for (let i = 1; i < parts.length; i += 1) {
      const child = current.children?.find((c) => c.name === parts[i]);
      if (!child) throw new ViewerError("invalid-file", `Path not found: ${path}`);
      current = child.value;
    }
    return current;
  }

  const summary: ContainerSummary = {
    format: "matlab-v5",
    formatDetail: "MATLAB Level 5 MAT-file",
    fileSize: file.size,
    rootChildren,
    rootAttributes,
  };

  return {
    summary,
    async listGroup(path: string, reqSignal?: AbortSignal): Promise<GroupInfo> {
      if (path === "/" || path === "") {
        return { path: "/", name: "/", children: rootChildren, attributes: rootAttributes };
      }
      const val = await resolvePath(path, reqSignal);
      const children = (val.children ?? []).map((c) => valueToTreeNode(`${path}/${c.name}`, c.name, c.value));
      const attrs: AttributeItem[] = [
        { name: "class", dtype: "string", shape: [], preview: val.objectClassName || mxClassName(val.mxClass, false, false) },
        { name: "shape", dtype: "int32", shape: [val.shape.length], preview: `[${val.shape.join(" × ")}]` },
      ];
      return { path, name: path.split("/").pop() || path, children, attributes: attrs };
    },
    async inspectDataset(path: string, reqSignal?: AbortSignal): Promise<DatasetInfo> {
      const val = await resolvePath(path, reqSignal);
      const attrs: AttributeItem[] = [
        { name: "MATLAB_class", dtype: "string", shape: [], preview: mxClassName(val.mxClass, val.isLogical, val.isComplex) },
        ...(val.sparse ? [{ name: "nonzeros", dtype: "int32", shape: [], preview: String(val.sparse.pr.length) }] : []),
      ];
      return {
        path,
        name: path.split("/").pop() || path,
        dtype: mxClassName(val.mxClass, val.isLogical, val.isComplex),
        shape: val.shape,
        totalElements: totalElementsOf(val.shape),
        isNumeric: isNumericMxClass(val.mxClass),
        isComplex: val.isComplex,
        isString: val.mxClass === MX_CHAR,
        order: "F",
        attributes: attrs,
      };
    },
    async readSlice(request: SliceRequest, reqSignal?: AbortSignal): Promise<SliceResult> {
      const val = await resolvePath(request.path, reqSignal);
      return sliceParsedValue(val, request);
    },
    async readHeatmap(request: HeatmapRequest, reqSignal?: AbortSignal): Promise<HeatmapResult> {
      const val = await resolvePath(request.path, reqSignal);
      return heatmapParsedValue(val, request);
    },
    dispose() {
      for (const entry of entries.values()) entry.parsed = undefined;
    },
  };
}

export async function openMatlabV4Source(file: Blob, signal: AbortSignal): Promise<ScientificDataSource> {
  if (file.size > MAX_DECOMPRESSED_BYTES) {
    throw new ViewerError("resource-limit", "MATLAB Level 4 file exceeds 64 MiB limit");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Map<string, ParsedMatValue>();
  const rootChildren: TreeNode[] = [];
  let offset = 0;

  while (offset + 20 <= bytes.length) {
    const rawTypeLE = view.getInt32(offset, true);
    const littleEndian = rawTypeLE >= 0 && rawTypeLE < 1000;
    const type = view.getInt32(offset, littleEndian);
    const mrows = view.getInt32(offset + 4, littleEndian);
    const ncols = view.getInt32(offset + 8, littleEndian);
    const imagf = view.getInt32(offset + 12, littleEndian);
    const namlen = view.getInt32(offset + 16, littleEndian);
    const p = Math.floor((type % 100) / 10);
    const t = type % 10;
    if (mrows < 0 || ncols < 0 || namlen < 2 || offset + 20 + namlen > bytes.length) {
      throw new ViewerError("invalid-file", "Invalid MATLAB Level 4 matrix header");
    }
    const name = utf8Decoder.decode(bytes.subarray(offset + 20, offset + 20 + namlen - 1));
    offset += 20 + namlen;
    const miType = p === 0 ? MI_DOUBLE : p === 1 ? MI_SINGLE : p === 2 ? MI_INT32 : p === 3 ? MI_INT16 : p === 4 ? MI_UINT16 : MI_UINT8;
    const mxClass = t === 1 ? MX_CHAR : p === 0 ? MX_DOUBLE : p === 1 ? MX_SINGLE : p === 2 ? MX_INT32 : p === 3 ? MX_INT16 : p === 4 ? MX_UINT16 : MX_UINT8;
    const elemSize = p === 0 ? 8 : p === 1 || p === 2 ? 4 : p === 3 || p === 4 ? 2 : 1;
    const dataBytes = mrows * ncols * elemSize;
    if (offset + dataBytes * (imagf ? 2 : 1) > bytes.length) {
      throw new ViewerError("invalid-file", "Truncated MATLAB Level 4 matrix data");
    }
    const real = readNumericElement(bytes, offset, dataBytes, miType, littleEndian);
    offset += dataBytes;
    let imag: Float64Array | BigInt64Array | BigUint64Array | undefined;
    if (imagf) {
      imag = readNumericElement(bytes, offset, dataBytes, miType, littleEndian);
      offset += dataBytes;
    }
    const text = t === 1 ? Array.from(real as Float64Array, (c) => String.fromCharCode(c)).join("") : undefined;
    const val: ParsedMatValue = {
      name,
      mxClass,
      isComplex: imagf !== 0,
      isLogical: false,
      shape: [mrows, ncols],
      real,
      imag,
      text,
    };
    values.set(`/${name}`, val);
    rootChildren.push({ path: `/${name}`, name, kind: "dataset", shape: val.shape, dtype: mxClassName(mxClass, false, val.isComplex) });
  }

  const summary: ContainerSummary = {
    format: "matlab-v4",
    formatDetail: "MATLAB Level 4 MAT-file",
    fileSize: file.size,
    rootChildren,
    rootAttributes: [{ name: "variables", dtype: "int32", shape: [], preview: String(values.size) }],
  };

  return {
    summary,
    async listGroup(path: string): Promise<GroupInfo> {
      if (path !== "/" && path !== "") throw new ViewerError("invalid-file", `Group not found: ${path}`);
      return { path: "/", name: "/", children: rootChildren, attributes: summary.rootAttributes };
    },
    async inspectDataset(path: string): Promise<DatasetInfo> {
      const val = values.get(path);
      if (!val) throw new ViewerError("invalid-file", `Variable not found: ${path}`);
      return {
        path,
        name: val.name,
        dtype: mxClassName(val.mxClass, false, val.isComplex),
        shape: val.shape,
        totalElements: totalElementsOf(val.shape),
        isNumeric: isNumericMxClass(val.mxClass),
        isComplex: val.isComplex,
        isString: val.mxClass === MX_CHAR,
        order: "F",
        attributes: [],
      };
    },
    async readSlice(request: SliceRequest): Promise<SliceResult> {
      const val = values.get(request.path);
      if (!val) throw new ViewerError("invalid-file", `Variable not found: ${request.path}`);
      return sliceParsedValue(val, request);
    },
    async readHeatmap(request: HeatmapRequest): Promise<HeatmapResult> {
      const val = values.get(request.path);
      if (!val) throw new ViewerError("invalid-file", `Variable not found: ${request.path}`);
      return heatmapParsedValue(val, request);
    },
    dispose() {
      values.clear();
    },
  };
}
