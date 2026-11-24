import type { ViewerErrorCode } from "@anyfile/viewer-protocol";

export const H5WASM_VERSION = "0.10.3";
export const H5WASM_RUNTIME_BASE = `/vendor/h5wasm/${H5WASM_VERSION}/`;

export type ContainerFormat =
  | "hdf5"
  | "netcdf4"
  | "netcdf-classic"
  | "netcdf-64bit"
  | "netcdf-cdf5"
  | "matlab-v5"
  | "matlab-v73"
  | "matlab-v4";

export type NodeKind = "group" | "dataset" | "soft-link" | "external-link" | "unknown";

export type TreeNode = {
  readonly path: string;
  readonly name: string;
  readonly kind: NodeKind;
  readonly shape?: readonly number[];
  readonly dtype?: string;
  readonly childCount?: number;
  readonly hasChildren?: boolean;
  readonly linkTarget?: string;
};

export type AttributeItem = {
  readonly name: string;
  readonly dtype: string;
  readonly shape: readonly number[];
  readonly preview: string;
};

export type DimensionInfo = {
  readonly name: string;
  readonly size: number;
  readonly unlimited?: boolean;
};

export type ContainerSummary = {
  readonly format: ContainerFormat;
  readonly formatDetail: string;
  readonly fileSize: number;
  readonly rootChildren: readonly TreeNode[];
  readonly rootAttributes: readonly AttributeItem[];
  readonly dimensions?: readonly DimensionInfo[];
  readonly notes?: readonly string[];
};

export type GroupInfo = {
  readonly path: string;
  readonly name: string;
  readonly children: readonly TreeNode[];
  readonly attributes: readonly AttributeItem[];
  readonly truncated?: boolean;
};

export type DatasetInfo = {
  readonly path: string;
  readonly name: string;
  readonly dtype: string;
  readonly shape: readonly number[];
  readonly totalElements: number;
  readonly isNumeric: boolean;
  readonly isComplex?: boolean;
  readonly isString?: boolean;
  readonly isCompound?: boolean;
  readonly compoundFields?: readonly string[];
  readonly order: "C" | "F";
  readonly attributes: readonly AttributeItem[];
  readonly chunks?: readonly number[] | null;
  readonly filters?: readonly string[];
  readonly dimensionNames?: readonly string[];
  readonly note?: string;
};

export type SliceRequest = {
  readonly path: string;
  readonly fixedIndices: readonly number[];
  readonly rowAxis: number;
  readonly colAxis: number;
  readonly rowOffset: number;
  readonly rowCount: number;
  readonly colOffset: number;
  readonly colCount: number;
};

export type SliceResult = {
  readonly values: readonly string[];
  readonly rows: number;
  readonly cols: number;
  readonly rowOffset: number;
  readonly colOffset: number;
  readonly totalRows: number;
  readonly totalCols: number;
  readonly compoundColumns?: readonly string[];
};

export type HeatmapRequest = {
  readonly path: string;
  readonly fixedIndices: readonly number[];
  readonly rowAxis: number;
  readonly colAxis: number;
  readonly maxDim: number;
};

export type HeatmapResult = {
  readonly width: number;
  readonly height: number;
  readonly data: Float64Array;
  readonly min: number;
  readonly max: number;
  readonly finiteCount: number;
  readonly strideRow: number;
  readonly strideCol: number;
  readonly sourceRows: number;
  readonly sourceCols: number;
};

export type ScientificDataSource = {
  readonly summary: ContainerSummary;
  listGroup(path: string, signal?: AbortSignal): Promise<GroupInfo>;
  inspectDataset(path: string, signal?: AbortSignal): Promise<DatasetInfo>;
  readSlice(request: SliceRequest, signal?: AbortSignal): Promise<SliceResult>;
  readHeatmap(request: HeatmapRequest, signal?: AbortSignal): Promise<HeatmapResult>;
  dispose(): void;
};

export type WorkerRequest =
  | { readonly id: number; readonly type: "init"; readonly baseUrl: string }
  | { readonly id: number; readonly type: "open"; readonly file: Blob; readonly fileName: string; readonly format: ContainerFormat }
  | { readonly id: number; readonly type: "listGroup"; readonly path: string }
  | { readonly id: number; readonly type: "inspectDataset"; readonly path: string }
  | { readonly id: number; readonly type: "readSlice"; readonly request: SliceRequest }
  | { readonly id: number; readonly type: "readHeatmap"; readonly request: HeatmapRequest };

export type WorkerResponse =
  | { readonly id: number; readonly type: "ready" }
  | { readonly id: number; readonly type: "opened"; readonly summary: ContainerSummary }
  | { readonly id: number; readonly type: "group"; readonly group: GroupInfo }
  | { readonly id: number; readonly type: "dataset"; readonly dataset: DatasetInfo }
  | { readonly id: number; readonly type: "slice"; readonly slice: SliceResult }
  | { readonly id: number; readonly type: "heatmap"; readonly heatmap: HeatmapResult }
  | { readonly id: number; readonly type: "error"; readonly code: ViewerErrorCode; readonly message: string };

export function formatScalarValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "NaN";
    if (!Number.isFinite(value)) return value > 0 ? "Inf" : "-Inf";
    if (Object.is(value, -0)) return "0";
    const abs = Math.abs(value);
    if (abs !== 0 && (abs >= 1e9 || abs < 1e-4)) return value.toExponential(6);
    return Number(value.toPrecision(10)).toString();
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    return value.length > 160 ? `${value.slice(0, 157)}…` : value;
  }
  if (Array.isArray(value)) {
    const shown = value.slice(0, 12).map((item) => formatScalarValue(item));
    return `[${shown.join(", ")}${value.length > 12 ? `, … (${value.length})` : ""}]`;
  }
  if (ArrayBuffer.isView(value)) {
    const arr = value as unknown as ArrayLike<number | bigint>;
    const limit = Math.min(arr.length, 12);
    const items: string[] = [];
    for (let i = 0; i < limit; i += 1) items.push(formatScalarValue(arr[i]));
    return `[${items.join(", ")}${arr.length > 12 ? `, … (${arr.length})` : ""}]`;
  }
  try {
    const text = JSON.stringify(value);
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  } catch {
    return String(value);
  }
}

export function totalElementsOf(shape: readonly number[]): number {
  if (shape.length === 0) return 1;
  let total = 1;
  for (const dim of shape) {
    if (!Number.isFinite(dim) || dim < 0) return 0;
    total *= dim;
  }
  return total;
}
