import {
  AgentError,
  abortError,
  isViewerAbortError,
  parsePositionCursor,
  renderMarkdownTablePage,
  ViewerError,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";
import { parseModel } from "./parse";
import type { ModelDocument } from "./types";

const PLUGIN_ID = "ml-weights";

/** Parses only the header through `BinarySource` range reads; tensor payloads are never read. */
async function openModel(context: ExtractContext): Promise<ModelDocument> {
  const { source, signal } = context;
  if (signal.aborted) throw abortError();
  try {
    return await parseModel({ size: source.size, readHead: (length) => source.read(0, length, signal) }, signal);
  } catch (error) {
    if (isViewerAbortError(error)) throw error;
    const message = error instanceof Error ? error.message : "Failed to parse model weights header.";
    const code = error instanceof ViewerError && error.code === "resource-limit" ? "resource-limit" : "invalid-file";
    throw new AgentError(code, message, { pluginId: PLUGIN_ID, cause: error });
  }
}

function tablePage(columns: string[], rows: readonly (readonly string[])[], params: ReadParams): ReadResult {
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  if (start > rows.length) throw new AgentError("target-not-found", `Cursor row ${start} is out of range.`, { pluginId: PLUGIN_ID });
  const needle = params.filter?.trim().toLowerCase();
  const result = renderMarkdownTablePage({
    columns,
    rows: rows.slice(start).map((row) => (!needle || row.some((cell) => cell.toLowerCase().includes(needle)) ? row : null)),
    start,
    maxBytes: params.maxBytes,
    cursorPrefix: "row:",
  });
  return needle ? { ...result, filterApplied: true } : result;
}

const mlWeightsExtractor: StructuredExtractor = {
  async inspect(context): Promise<InspectPayload> {
    const model = await openModel(context);
    const dtypes: Record<string, number> = {};
    for (const tensor of model.tensors) dtypes[tensor.dtype] = (dtypes[tensor.dtype] ?? 0) + 1;
    return {
      metadata: {
        format: model.format,
        version: model.version ?? null,
        architecture: model.architecture ?? null,
        tensorCount: model.tensorCount,
        totalParameters: model.totalParameters,
        totalBytes: model.totalBytes,
        metadataEntries: model.metadata.length,
        dtypes,
      },
      targets: [
        { id: "metadata", title: "Header metadata", kind: "table", size: model.metadata.length },
        { id: "tensors", title: "Tensor table", kind: "table", size: model.tensors.length },
      ],
    };
  },

  async read(context, params): Promise<ReadResult> {
    const model = await openModel(context);
    const target = params.target ?? "metadata";
    if (target === "metadata") {
      return tablePage(["Key", "Value"], model.metadata.map(({ key, value }) => [key, value]), params);
    }
    if (target === "tensors") {
      return tablePage(
        ["Name", "Dtype", "Shape", "Parameters", "Bytes"],
        model.tensors.map((t) => [t.name, t.dtype, `[${t.shape.join(", ")}]`, String(t.shape.reduce((n, d) => n * d, 1)), String(t.bytes)]),
        params,
      );
    }
    throw new AgentError("target-not-found", `Unknown ML weights target: "${target}".`, { pluginId: PLUGIN_ID });
  },
};

export default mlWeightsExtractor;
