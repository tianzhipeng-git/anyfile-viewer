import {
  AgentError,
  abortError,
  isViewerAbortError,
  paginateLines,
  parsePositionCursor,
  renderMarkdownTablePage,
  ViewerError,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";
import { openHdf5NodeSource } from "./hdf5-node";
import { openMatlabV4Source, openMatlabV5Source } from "./matlab-mat";
import { openNetCdfClassicSource } from "./netcdf-classic";
import { detectScientificFormat, extensionOf, PROBE_READ_BYTES } from "./probe";
import { totalElementsOf, type AttributeItem, type DatasetInfo, type ScientificDataSource, type TreeNode } from "./types";

const PLUGIN_ID = "scientific-data";
/** Tree walk bounds shared by `inspect` targets and the `summary` outline. */
const MAX_TREE_NODES = 1_000;
const MAX_TREE_GROUPS = 200;
const MAX_TABLE_COLUMNS = 64;
const MAX_PAGE_ROWS = 1_000;
const MAX_SCAN_ROWS = 10_000;
const SLICE_CELLS = 20_000;
/** Below this leftover budget the first dataset page stops after the info lines. */
const MIN_TABLE_BYTES = 1_024;

const encoder = new TextEncoder();

function toAgentError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof ViewerError) {
    const code = error.code === "resource-limit" || error.code === "missing-related-file"
      ? error.code
      : error.code === "runtime-unavailable" || error.code === "unsupported-environment" ? "runtime-unavailable" : "invalid-file";
    throw new AgentError(code, message, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", message, { pluginId: PLUGIN_ID, cause: error });
}

async function openContainer(context: ExtractContext): Promise<ScientificDataSource> {
  const { source, file, signal } = context;
  if (signal.aborted) throw abortError();
  const head = await source.read(0, Math.min(source.size, PROBE_READ_BYTES), signal);
  const detected = head.byteLength >= 8 ? detectScientificFormat(head, extensionOf(source.name), source.size) : null;
  if (!detected) {
    throw new AgentError("invalid-file", "Not an HDF5, NetCDF or MATLAB MAT container.", { pluginId: PLUGIN_ID });
  }
  const { format } = detected;
  if (format === "hdf5" || format === "netcdf4" || format === "matlab-v73") return openHdf5NodeSource(context, format);
  if (format === "netcdf-classic" || format === "netcdf-64bit" || format === "netcdf-cdf5") return openNetCdfClassicSource(file, signal);
  if (format === "matlab-v5") return openMatlabV5Source(file, signal);
  return openMatlabV4Source(file, signal);
}

async function withContainer<T>(context: ExtractContext, run: (source: ScientificDataSource) => Promise<T>): Promise<T> {
  try {
    const source = await openContainer(context);
    try {
      return await run(source);
    } finally {
      source.dispose();
    }
  } catch (error) {
    toAgentError(error);
  }
}

type WalkedNode = TreeNode & { readonly depth: number };

/** Depth-first walk of the group tree, bounded by node and group-listing counts. */
async function walkTree(source: ScientificDataSource, signal: AbortSignal) {
  const nodes: WalkedNode[] = [];
  let groups = 0;
  let truncated = Boolean(source.summary.notes?.length);
  const visit = async (children: readonly TreeNode[], depth: number): Promise<void> => {
    for (const child of children) {
      if (signal.aborted) throw abortError();
      if (nodes.length >= MAX_TREE_NODES) {
        truncated = true;
        return;
      }
      nodes.push({ ...child, depth });
      if (child.kind !== "group" || child.hasChildren === false) continue;
      if (groups >= MAX_TREE_GROUPS) {
        truncated = true;
        continue;
      }
      groups += 1;
      const group = await source.listGroup(child.path, signal);
      if (group.truncated) truncated = true;
      await visit(group.children, depth + 1);
    }
  };
  await visit(source.summary.rootChildren, 0);
  return { nodes, truncated };
}

/** Resolves a node by walking only its ancestors, so reads never list the whole tree. */
async function findNode(source: ScientificDataSource, path: string, signal: AbortSignal): Promise<TreeNode | undefined> {
  let children = source.summary.rootChildren;
  let current = "";
  const segments = path.split("/").filter(Boolean);
  for (const [index, segment] of segments.entries()) {
    if (signal.aborted) throw abortError();
    current += `/${segment}`;
    const node = children.find((child) => child.path === current);
    if (!node || index === segments.length - 1) return node;
    if (node.kind !== "group") return undefined;
    children = (await source.listGroup(node.path, signal)).children;
  }
  return undefined;
}

const shapeText = (shape: readonly number[]) => `[${shape.join(" × ")}]`;
const attributeLine = (attr: AttributeItem) =>
  `- ${attr.name} (${attr.dtype}${attr.shape.length ? ` ${shapeText(attr.shape)}` : ""}): ${attr.preview}`;

function nodeLine(node: TreeNode, depth = 0): string {
  const indent = "  ".repeat(depth);
  if (node.kind === "group") return `${indent}- ${node.path}/ — group${node.childCount !== undefined ? ` (${node.childCount} items)` : ""}`;
  if (node.kind === "dataset") return `${indent}- ${node.path} — dataset ${node.dtype ?? "unknown"} ${shapeText(node.shape ?? [])}`;
  if (node.linkTarget !== undefined) return `${indent}- ${node.path} → ${node.linkTarget} (${node.kind})`;
  return `${indent}- ${node.path} (${node.kind})`;
}

function targetOf(node: TreeNode): TargetEntry | undefined {
  if (node.kind === "group") return { id: `group:${node.path}`, title: node.path, kind: "group", ...(node.childCount !== undefined ? { size: node.childCount } : {}) };
  if (node.kind === "dataset") {
    return { id: `dataset:${node.path}`, title: `${node.path} (${node.dtype ?? "unknown"} ${shapeText(node.shape ?? [])})`, kind: "dataset", size: totalElementsOf(node.shape ?? []) };
  }
  return undefined;
}

function pageLines(lines: readonly string[], params: ReadParams): ReadResult {
  const needle = params.filter?.trim().toLowerCase();
  const selected = needle ? lines.filter((line) => line.toLowerCase().includes(needle)) : lines;
  const page = paginateLines(selected, params.cursor, params.maxBytes, PLUGIN_ID);
  return { ...page, contentType: "markdown", ...(needle ? { filterApplied: true } : {}) };
}

async function summaryLines(source: ScientificDataSource, signal: AbortSignal): Promise<string[]> {
  const { summary } = source;
  const { nodes, truncated } = await walkTree(source, signal);
  return [
    `# ${summary.formatDetail}`,
    `- File size: ${summary.fileSize} bytes`,
    ...(summary.dimensions?.length ? ["", "## Dimensions", ...summary.dimensions.map((d) => `- ${d.name} = ${d.size}${d.unlimited ? " (unlimited)" : ""}`)] : []),
    ...(summary.rootAttributes.length ? ["", "## Attributes", ...summary.rootAttributes.map(attributeLine)] : []),
    ...(summary.notes?.length ? ["", "## Notes", ...summary.notes.map((note) => `- ${note}`)] : []),
    "",
    "## Tree",
    ...nodes.map((node) => nodeLine(node, node.depth)),
    ...(truncated ? [`- … tree truncated (outline lists at most ${MAX_TREE_NODES} nodes)`] : []),
  ];
}

type TableLayout = {
  readonly rowAxis: number;
  readonly colAxis: number;
  readonly outerAxes: readonly number[];
  readonly rowsPerSlice: number;
  readonly colCount: number;
  readonly totalCols: number;
  readonly totalRows: number;
};

/** Pages an N-d dataset as 2D slices: C order tabulates the last two axes, F order the first two. */
function tableLayout({ shape, order }: DatasetInfo): TableLayout {
  const n = shape.length;
  if (n < 2) {
    const rows = n === 0 ? 1 : shape[0];
    return { rowAxis: 0, colAxis: 0, outerAxes: [], rowsPerSlice: rows, colCount: 1, totalCols: 1, totalRows: rows };
  }
  const [rowAxis, colAxis] = order === "F" ? [0, 1] : [n - 2, n - 1];
  const outerAxes = shape.map((_, axis) => axis).filter((axis) => axis !== rowAxis && axis !== colAxis);
  const outer = outerAxes.reduce((product, axis) => product * shape[axis], 1);
  return {
    rowAxis,
    colAxis,
    outerAxes,
    rowsPerSlice: shape[rowAxis],
    colCount: Math.min(shape[colAxis], MAX_TABLE_COLUMNS),
    totalCols: shape[colAxis],
    totalRows: outer * shape[rowAxis],
  };
}

function datasetInfoLines(info: DatasetInfo, layout: TableLayout): string[] {
  return [
    `# Dataset ${info.path}`,
    `- dtype: ${info.dtype}`,
    `- shape: ${shapeText(info.shape)} (${info.totalElements} elements, ${info.order === "F" ? "column-major" : "row-major"})`,
    ...(info.dimensionNames?.length ? [`- dimensions: ${info.dimensionNames.join(", ")}`] : []),
    ...(info.chunks?.length ? [`- chunks: ${shapeText(info.chunks)}`] : []),
    ...(info.filters?.length ? [`- filters: ${info.filters.join(", ")}`] : []),
    ...(info.note ? [`- note: ${info.note}`] : []),
    ...(info.shape.length >= 2
      ? [`- table: rows = axis ${layout.rowAxis}${layout.outerAxes.length ? ` (per index of axes ${layout.outerAxes.join(", ")})` : ""}, columns = axis ${layout.colAxis}${layout.totalCols > layout.colCount ? ` (first ${layout.colCount} of ${layout.totalCols} shown)` : ""}`]
      : []),
    ...(info.attributes.length ? ["", "## Attributes", ...info.attributes.map(attributeLine)] : []),
  ];
}

async function datasetTablePage(
  source: ScientificDataSource,
  info: DatasetInfo,
  layout: TableLayout,
  start: number,
  maxBytes: number,
  needle: string | undefined,
  signal: AbortSignal,
): Promise<ReadResult> {
  if (start > layout.totalRows) throw new AgentError("target-not-found", `Cursor row ${start} is out of range.`, { pluginId: PLUGIN_ID });
  const rows: (string[] | null)[] = [];
  let columns: string[] = ["index", "value"];
  let position = start;
  let included = 0;
  let bytes = 0;
  const chunkRows = Math.max(1, Math.floor(SLICE_CELLS / layout.colCount));
  while (position < layout.totalRows && rows.length < MAX_SCAN_ROWS && included < MAX_PAGE_ROWS && bytes <= maxBytes) {
    if (signal.aborted) throw abortError();
    let outer = Math.floor(position / layout.rowsPerSlice);
    const rowOffset = position % layout.rowsPerSlice;
    const fixedIndices = info.shape.map(() => 0);
    for (const axis of [...layout.outerAxes].reverse()) {
      fixedIndices[axis] = outer % info.shape[axis];
      outer = Math.floor(outer / info.shape[axis]);
    }
    const slice = await source.readSlice({
      path: info.path,
      fixedIndices,
      rowAxis: layout.rowAxis,
      colAxis: layout.colAxis,
      rowOffset,
      rowCount: Math.min(layout.rowsPerSlice - rowOffset, chunkRows, MAX_SCAN_ROWS - rows.length),
      colOffset: 0,
      colCount: layout.colCount,
    }, signal);
    if (slice.rows === 0) break;
    columns = ["index", ...(slice.compoundColumns ?? (slice.cols > 1 ? Array.from({ length: slice.cols }, (_, c) => String(c)) : ["value"]))];
    for (let r = 0; r < slice.rows; r += 1) {
      const coords = fixedIndices.map(String);
      if (info.shape.length >= 1) coords[layout.rowAxis] = String(rowOffset + r);
      if (info.shape.length >= 2) coords[layout.colAxis] = ":";
      const row = [`[${coords.join(", ")}]`, ...slice.values.slice(r * slice.cols, (r + 1) * slice.cols)];
      if (needle && !row.some((cell) => cell.toLowerCase().includes(needle))) {
        rows.push(null);
        continue;
      }
      rows.push(row);
      included += 1;
      bytes += encoder.encode(row.join(" | ")).byteLength + 5;
    }
    position += slice.rows;
  }
  const result = renderMarkdownTablePage({
    columns,
    rows,
    start,
    maxBytes,
    cursorPrefix: "row:",
    hasMoreAfter: () => position < layout.totalRows,
  });
  return needle ? { ...result, filterApplied: true } : result;
}

async function readDataset(source: ScientificDataSource, path: string, params: ReadParams, signal: AbortSignal): Promise<ReadResult> {
  const info = await source.inspectDataset(path, signal);
  const layout = tableLayout(info);
  const needle = params.filter?.trim().toLowerCase() || undefined;
  if (params.cursor?.startsWith("row:")) {
    const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
    return datasetTablePage(source, info, layout, start, params.maxBytes, needle, signal);
  }
  // The first page leads with dtype/shape/attributes (`line:` cursors) and continues into the values table (`row:` cursors).
  const head = pageLines(datasetInfoLines(info, layout), params);
  if (head.nextCursor || layout.totalRows === 0) return head;
  const room = params.maxBytes - encoder.encode(head.content).byteLength - 2;
  if (room < MIN_TABLE_BYTES) return { ...head, truncated: true, nextCursor: "row:0" };
  const table = await datasetTablePage(source, info, layout, 0, room, needle, signal);
  return {
    ...table,
    content: head.content ? `${head.content}\n\n${table.content}` : table.content,
    truncated: table.truncated || head.truncated,
  };
}

const scientificDataExtractor: StructuredExtractor = {
  inspect(context): Promise<InspectPayload> {
    return withContainer(context, async (source) => {
      const { summary } = source;
      const { nodes, truncated } = await walkTree(source, context.signal);
      const targets = nodes.map((node) => targetOf(node)).filter((target) => target !== undefined);
      const attributes: Record<string, JsonValue> = {};
      for (const attr of summary.rootAttributes.slice(0, 32)) attributes[attr.name] = attr.preview;
      return {
        metadata: {
          format: summary.format,
          formatDetail: summary.formatDetail,
          fileSize: summary.fileSize,
          groups: nodes.filter((node) => node.kind === "group").length,
          datasets: nodes.filter((node) => node.kind === "dataset").length,
          ...(summary.dimensions?.length
            ? { dimensions: Object.fromEntries(summary.dimensions.map((d) => [d.name, d.unlimited ? `${d.size} (unlimited)` : d.size])) }
            : {}),
          attributes,
        },
        targets: [{ id: "summary", title: "Summary and tree outline", kind: "summary" }, ...targets],
        ...(truncated ? { targetsTruncated: true } : {}),
      };
    });
  },

  read(context, params): Promise<ReadResult> {
    return withContainer(context, async (source) => {
      const target = params.target ?? "summary";
      if (target === "summary") return pageLines(await summaryLines(source, context.signal), params);
      const match = /^(group|dataset):(\/.*)$/.exec(target);
      const node = match ? await findNode(source, match[2], context.signal) : undefined;
      if (!match || !node || node.kind !== match[1]) {
        throw new AgentError("target-not-found", `Scientific data target not found: "${target}".`, { pluginId: PLUGIN_ID });
      }
      if (node.kind === "dataset") return readDataset(source, node.path, params, context.signal);
      const group = await source.listGroup(node.path, context.signal);
      return pageLines([
        `# Group ${group.path}`,
        ...group.children.map((child) => nodeLine(child)),
        ...(group.truncated ? ["- … children truncated"] : []),
        ...(group.attributes.length ? ["", "## Attributes", ...group.attributes.map(attributeLine)] : []),
      ], params);
    });
  },
};

export default scientificDataExtractor;
