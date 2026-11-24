import type {
  AttributeItem,
  ContainerFormat,
  ContainerSummary,
  DatasetInfo,
  GroupInfo,
  HeatmapRequest,
  HeatmapResult,
  SliceRequest,
  SliceResult,
  TreeNode,
} from "./types";
import { formatScalarValue, totalElementsOf } from "./types";

const MAX_GROUP_CHILDREN = 5_000;
const MAX_ATTRIBUTES = 512;
const MAX_SLICE_CELLS = 100_000;

type SliceRange = [] | [number] | [number, number] | [number, number, number];

export type H5AttributeLike = {
  readonly dtype: unknown;
  readonly shape: number[] | null;
  readonly value: unknown;
};

export type H5MetadataLike = {
  readonly type?: number;
  readonly size?: number;
  readonly signed?: boolean;
  readonly vlen?: boolean;
  readonly chunks?: number[] | null;
  readonly compound_type?: { readonly members?: readonly { readonly name: string }[] };
};

export type H5EntityLike = {
  readonly type?: string;
  readonly path?: string;
  readonly ref_data?: Uint8Array;
  readonly target?: string;
  readonly filename?: string;
  readonly obj_path?: string;
  readonly attrs?: Record<string, H5AttributeLike>;
  readonly shape?: number[] | null;
  readonly dtype?: unknown;
  readonly metadata?: H5MetadataLike;
  readonly filters?: readonly { readonly name?: string; readonly id?: number }[];
  readonly value?: unknown;
  keys?: () => string[];
  get?: (name: string) => H5EntityLike | null;
  slice?: (ranges: SliceRange[]) => unknown;
  get_dimension_labels?: () => (string | null)[];
  close?: () => void;
};

export type H5FileLike = H5EntityLike & {
  close(): void;
};

function joinH5Path(parent: string, name: string): string {
  if (parent === "/" || parent === "") return `/${name}`;
  return `${parent}/${name}`;
}

function baseName(path: string): string {
  if (path === "/" || path === "") return "/";
  const idx = path.lastIndexOf("/");
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function formatDtype(dtype: unknown, meta?: H5MetadataLike): string {
  if (typeof dtype === "string") {
    const code = dtype.replace(/^[<>|]/, "");
    if (code === "f4" || code === "f") return "float32";
    if (code === "f8" || code === "d") return "float64";
    if (code === "f2" || code === "e") return "float16";
    if (code === "i1" || code === "b") return "int8";
    if (code === "u1" || code === "B") return "uint8";
    if (code === "i2" || code === "h") return "int16";
    if (code === "u2" || code === "H") return "uint16";
    if (code === "i4" || code === "i" || code === "l") return "int32";
    if (code === "u4" || code === "I" || code === "L") return "uint32";
    if (code === "i8" || code === "q") return "int64";
    if (code === "u8" || code === "Q") return "uint64";
    if (dtype === "S" || dtype.startsWith("S")) return meta?.vlen ? "string (vlen)" : `string (${dtype})`;
    return dtype;
  }
  if (meta?.compound_type?.members) {
    return `compound (${meta.compound_type.members.length} fields)`;
  }
  if (dtype && typeof dtype === "object") {
    if ("compound_type" in dtype) return "compound";
    if ("array_type" in dtype) return "array";
  }
  return "unknown";
}

function isNumericDtype(dtype: unknown, meta?: H5MetadataLike): boolean {
  if (meta?.compound_type) return false;
  if (typeof dtype !== "string") return false;
  return /^[<>|]?([iuf][1248]?|[bBhHiIlLqQefd])$/.test(dtype) && !dtype.startsWith("S");
}

function isStringDtype(dtype: unknown): boolean {
  if (typeof dtype !== "string") return false;
  return dtype === "S" || dtype.startsWith("S") || dtype.startsWith("U");
}

function readAttributes(entity: H5EntityLike): AttributeItem[] {
  const out: AttributeItem[] = [];
  let attrs: Record<string, H5AttributeLike> | undefined;
  try {
    attrs = entity.attrs;
  } catch {
    return out;
  }
  if (!attrs) return out;
  const names = Object.keys(attrs).slice(0, MAX_ATTRIBUTES);
  for (const name of names) {
    try {
      const attr = attrs[name];
      const shape = Array.isArray(attr.shape) ? attr.shape : [];
      let preview = "—";
      try {
        const val = attr.value;
        preview = formatScalarValue(val);
      } catch {
        preview = "<unreadable>";
      }
      out.push({
        name,
        dtype: formatDtype(attr.dtype),
        shape,
        preview,
      });
    } catch {
      out.push({ name, dtype: "unknown", shape: [], preview: "<unreadable>" });
    }
  }
  return out;
}

function summarizeChild(parentPath: string, name: string, child: H5EntityLike | null): TreeNode {
  const path = joinH5Path(parentPath, name);
  if (!child) {
    return { path, name, kind: "unknown" };
  }
  if (child.type === "Group") {
    let childCount: number | undefined;
    try {
      childCount = child.keys?.().length;
    } catch {
      childCount = undefined;
    }
    return {
      path,
      name,
      kind: "group",
      childCount,
      hasChildren: (childCount ?? 0) > 0,
    };
  }
  if (child.type === "Dataset") {
    let shape: number[] = [];
    let dtype = "unknown";
    try {
      shape = Array.isArray(child.shape) ? child.shape : [];
      dtype = formatDtype(child.dtype, child.metadata);
    } catch {
      // Keep defaults on exotic dataset types.
    }
    return { path, name, kind: "dataset", shape, dtype };
  }
  if (child.type === "BrokenSoftLink") {
    return { path, name, kind: "soft-link", linkTarget: child.target ?? "" };
  }
  if (child.type === "ExternalLink") {
    return {
      path,
      name,
      kind: "external-link",
      linkTarget: `${child.filename ?? ""}:${child.obj_path ?? ""}`,
    };
  }
  return { path, name, kind: "unknown" };
}

function flattenToStrings(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "bigint" || typeof raw === "boolean") {
    return [formatScalarValue(raw)];
  }
  if (ArrayBuffer.isView(raw)) {
    const arr = raw as unknown as ArrayLike<number | bigint>;
    const out = new Array<string>(arr.length);
    for (let i = 0; i < arr.length; i += 1) out[i] = formatScalarValue(arr[i]);
    return out;
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    const stack: unknown[] = [...raw];
    // Preserve order with recursive helper.
    const push = (item: unknown) => {
      if (Array.isArray(item)) {
        for (const sub of item) push(sub);
      } else if (ArrayBuffer.isView(item)) {
        const arr = item as unknown as ArrayLike<number | bigint>;
        for (let i = 0; i < arr.length; i += 1) out.push(formatScalarValue(arr[i]));
      } else {
        out.push(formatScalarValue(item));
      }
    };
    for (const item of stack) push(item);
    return out;
  }
  return [formatScalarValue(raw)];
}

function flattenToNumbers(raw: unknown): Float64Array {
  if (raw === null || raw === undefined) return new Float64Array(0);
  if (typeof raw === "number") return Float64Array.from([raw]);
  if (typeof raw === "bigint") return Float64Array.from([Number(raw)]);
  if (ArrayBuffer.isView(raw)) {
    const arr = raw as unknown as ArrayLike<number | bigint>;
    const out = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i += 1) out[i] = Number(arr[i]);
    return out;
  }
  if (Array.isArray(raw)) {
    const nums: number[] = [];
    const push = (item: unknown) => {
      if (Array.isArray(item)) {
        for (const sub of item) push(sub);
      } else if (ArrayBuffer.isView(item)) {
        const arr = item as unknown as ArrayLike<number | bigint>;
        for (let i = 0; i < arr.length; i += 1) nums.push(Number(arr[i]));
      } else if (typeof item === "number" || typeof item === "bigint") {
        nums.push(Number(item));
      } else {
        nums.push(Number.NaN);
      }
    };
    push(raw);
    return Float64Array.from(nums);
  }
  return new Float64Array(0);
}

export class Hdf5Engine {
  private closed = false;
  constructor(
    private readonly file: H5FileLike,
    private readonly format: ContainerFormat,
    private readonly fileSize: number,
  ) {}

  private resolve(path: string): H5EntityLike {
    if (this.closed) throw new Error("HDF5 file is closed");
    if (path === "/" || path === "") return this.file;
    const rel = path.startsWith("/") ? path.slice(1) : path;
    const entity = this.file.get?.(rel);
    if (!entity) throw new Error(`Path not found: ${path}`);
    return entity;
  }

  summary(): ContainerSummary {
    const root = this.listGroup("/");
    const formatDetail =
      this.format === "netcdf4"
        ? "NetCDF-4 (HDF5)"
        : this.format === "matlab-v73"
          ? "MATLAB v7.3 (HDF5)"
          : "HDF5";
    return {
      format: this.format,
      formatDetail,
      fileSize: this.fileSize,
      rootChildren: root.children,
      rootAttributes: root.attributes,
      notes: root.truncated ? [`Root group has more than ${MAX_GROUP_CHILDREN} items; list is truncated.`] : undefined,
    };
  }

  listGroup(path: string): GroupInfo {
    const entity = this.resolve(path);
    const allKeys = entity.keys?.() ?? [];
    const truncated = allKeys.length > MAX_GROUP_CHILDREN;
    const keys = allKeys.slice(0, MAX_GROUP_CHILDREN);
    const children: TreeNode[] = [];
    for (const key of keys) {
      let child: H5EntityLike | null = null;
      try {
        child = entity.get?.(key) ?? null;
      } catch {
        child = null;
      }
      children.push(summarizeChild(path, key, child));
    }
    return {
      path,
      name: baseName(path),
      children,
      attributes: readAttributes(entity),
      truncated,
    };
  }

  inspectDataset(path: string): DatasetInfo {
    const entity = this.resolve(path);
    if (entity.type !== "Dataset") throw new Error(`Not a dataset: ${path}`);
    const shape = Array.isArray(entity.shape) ? entity.shape : [];
    const meta = entity.metadata;
    const attrs = readAttributes(entity);
    const matlabClass = attrs.find((a) => a.name === "MATLAB_class")?.preview;
    const isMatlabChar = matlabClass === "char" || matlabClass === '"char"';
    const compoundFields = meta?.compound_type?.members?.map((m) => m.name);
    const filters = (entity.filters ?? [])
      .map((f) => f.name ?? (f.id !== undefined ? `filter#${f.id}` : "unknown"))
      .filter(Boolean);
    let dimensionNames: string[] | undefined;
    try {
      const labels = entity.get_dimension_labels?.();
      if (labels && labels.some((l) => l && l.length > 0)) {
        dimensionNames = labels.map((l, idx) => l || `axis_${idx}`);
      }
    } catch {
      // Optional dimension scale labels.
    }
    return {
      path,
      name: baseName(path),
      dtype: isMatlabChar ? "char (MATLAB UTF-16)" : formatDtype(entity.dtype, meta),
      shape,
      totalElements: totalElementsOf(shape),
      isNumeric: !isMatlabChar && isNumericDtype(entity.dtype, meta),
      isString: isMatlabChar || isStringDtype(entity.dtype),
      isCompound: Boolean(compoundFields && compoundFields.length > 0),
      compoundFields,
      order: this.format === "matlab-v73" ? "F" : "C",
      attributes: attrs,
      chunks: meta?.chunks ?? null,
      filters: filters.length > 0 ? filters : undefined,
      dimensionNames,
    };
  }

  readSlice(req: SliceRequest): SliceResult {
    const entity = this.resolve(req.path);
    if (entity.type !== "Dataset") throw new Error(`Not a dataset: ${req.path}`);
    const shape = Array.isArray(entity.shape) ? entity.shape : [];
    const meta = entity.metadata;
    const compoundFields = meta?.compound_type?.members?.map((m) => m.name);

    if (shape.length === 0) {
      const raw = entity.value;
      if (compoundFields && compoundFields.length > 0 && Array.isArray(raw)) {
        return {
          values: raw.map((v) => formatScalarValue(v)),
          rows: 1,
          cols: compoundFields.length,
          rowOffset: 0,
          colOffset: 0,
          totalRows: 1,
          totalCols: compoundFields.length,
          compoundColumns: compoundFields,
        };
      }
      return {
        values: [formatScalarValue(raw)],
        rows: 1,
        cols: 1,
        rowOffset: 0,
        colOffset: 0,
        totalRows: 1,
        totalCols: 1,
      };
    }

    if (shape.length === 1) {
      const totalRows = shape[0];
      const rowOffset = Math.max(0, Math.min(req.rowOffset, totalRows));
      const rows = Math.max(0, Math.min(req.rowCount, totalRows - rowOffset));
      if (rows === 0) {
        return { values: [], rows: 0, cols: 1, rowOffset, colOffset: 0, totalRows, totalCols: 1 };
      }
      const raw = entity.slice?.([[rowOffset, rowOffset + rows]]);
      if (compoundFields && compoundFields.length > 0 && Array.isArray(raw)) {
        const cols = compoundFields.length;
        const values: string[] = [];
        for (const record of raw) {
          if (Array.isArray(record)) {
            for (let c = 0; c < cols; c += 1) values.push(formatScalarValue(record[c]));
          } else {
            values.push(formatScalarValue(record));
            for (let c = 1; c < cols; c += 1) values.push("");
          }
        }
        return {
          values,
          rows,
          cols,
          rowOffset,
          colOffset: 0,
          totalRows,
          totalCols: cols,
          compoundColumns: compoundFields,
        };
      }
      const flat = flattenToStrings(raw);
      return { values: flat.slice(0, rows), rows, cols: 1, rowOffset, colOffset: 0, totalRows, totalCols: 1 };
    }

    const rowAxis = Math.max(0, Math.min(req.rowAxis, shape.length - 1));
    const colAxis = req.colAxis === rowAxis
      ? (rowAxis === 0 ? 1 : 0)
      : Math.max(0, Math.min(req.colAxis, shape.length - 1));
    const totalRows = shape[rowAxis];
    const totalCols = shape[colAxis];
    const rowOffset = Math.max(0, Math.min(req.rowOffset, totalRows));
    const colOffset = Math.max(0, Math.min(req.colOffset, totalCols));
    const rows = Math.max(0, Math.min(req.rowCount, totalRows - rowOffset));
    const cols = Math.max(0, Math.min(req.colCount, totalCols - colOffset));
    if (rows * cols > MAX_SLICE_CELLS) {
      throw new Error(`Requested slice exceeds limit of ${MAX_SLICE_CELLS} cells`);
    }
    if (rows === 0 || cols === 0) {
      return { values: [], rows, cols, rowOffset, colOffset, totalRows, totalCols };
    }

    const ranges: SliceRange[] = shape.map((dim, axis) => {
      if (axis === rowAxis) return [rowOffset, rowOffset + rows];
      if (axis === colAxis) return [colOffset, colOffset + cols];
      const fixed = Math.max(0, Math.min(req.fixedIndices[axis] ?? 0, Math.max(0, dim - 1)));
      return [fixed, fixed + 1];
    });
    const raw = entity.slice?.(ranges);
    const flat = flattenToStrings(raw);
    if (rowAxis < colAxis) {
      return { values: flat.slice(0, rows * cols), rows, cols, rowOffset, colOffset, totalRows, totalCols };
    }
    // Transpose when rowAxis > colAxis because h5wasm returns in ascending axis order.
    const values = new Array<string>(rows * cols);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        values[r * cols + c] = flat[c * rows + r] ?? "—";
      }
    }
    return { values, rows, cols, rowOffset, colOffset, totalRows, totalCols };
  }

  readHeatmap(req: HeatmapRequest): HeatmapResult {
    const entity = this.resolve(req.path);
    if (entity.type !== "Dataset") throw new Error(`Not a dataset: ${req.path}`);
    const shape = Array.isArray(entity.shape) ? entity.shape : [];
    if (shape.length < 2) throw new Error("Heatmap requires at least a 2D dataset");

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

    const ranges: SliceRange[] = shape.map((dim, axis) => {
      if (axis === rowAxis) return [0, sourceRows, strideRow];
      if (axis === colAxis) return [0, sourceCols, strideCol];
      const fixed = Math.max(0, Math.min(req.fixedIndices[axis] ?? 0, Math.max(0, dim - 1)));
      return [fixed, fixed + 1];
    });
    const raw = entity.slice?.(ranges);
    const flat = flattenToNumbers(raw);
    const data = new Float64Array(height * width);
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let finiteCount = 0;

    for (let r = 0; r < height; r += 1) {
      for (let c = 0; c < width; c += 1) {
        const value = rowAxis < colAxis ? flat[r * width + c] : flat[c * height + r];
        const v = value ?? Number.NaN;
        data[r * width + c] = v;
        if (Number.isFinite(v)) {
          if (v < min) min = v;
          if (v > max) max = v;
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

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.file.close();
    } catch {
      // Ignore close error on already-closed handle.
    }
  }
}
