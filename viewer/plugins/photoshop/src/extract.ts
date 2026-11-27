import {
  downscaleRgba,
  AgentError,
  HARD_READ_MAX_BYTES,
  abortError,
  isViewerAbortError,
  paginateLines,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type RgbaImage,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";
import { decodePhotoshop, inspectPhotoshopDocument, type PhotoshopLayerSummary } from "./decode";
import { inspectPhotoshopHeader, type PhotoshopHeader } from "./format";
import type { PhotoshopDocumentInfo } from "./types";

const PLUGIN_ID = "photoshop-document";
const MAX_INPUT_BYTES = 256 * 1024 * 1024;

function mapError(error: unknown): never {
  if (error instanceof AgentError) throw error;
  if (isViewerAbortError(error)) throw error;
  if (error instanceof RangeError) {
    throw new AgentError("resource-limit", error.message, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError(
    "invalid-file",
    error instanceof Error ? error.message : "Failed to decode Photoshop document.",
    { pluginId: PLUGIN_ID, cause: error },
  );
}

async function readPsdBuffer(context: ExtractContext): Promise<{
  readonly header: PhotoshopHeader;
  readonly buffer: ArrayBuffer;
}> {
  if (context.signal.aborted) throw abortError();
  if (context.source.size > MAX_INPUT_BYTES) {
    throw new AgentError(
      "resource-limit",
      `Photoshop file size (${(context.source.size / (1024 * 1024)).toFixed(1)} MiB) exceeds the 256 MiB limit.`,
      { pluginId: PLUGIN_ID },
    );
  }
  const bytes = await context.source.read(0, context.source.size, context.signal);
  if (context.signal.aborted) throw abortError();
  const header = inspectPhotoshopHeader(bytes);
  if (!header) {
    throw new AgentError("invalid-file", "Not a valid Photoshop PSD/PSB document.", { pluginId: PLUGIN_ID });
  }
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return { header, buffer };
}

function formatLayerLine(layer: PhotoshopLayerSummary): string {
  const indent = "  ".repeat(layer.depth);
  const vis = layer.visible ? "visible" : "hidden";
  const kind = layer.isGroup ? "group" : layer.text ? "text" : "layer";
  const parts = [kind, vis, `opacity=${Math.round(layer.opacity * 100)}%`];
  if (layer.blendMode) parts.push(`blend=${layer.blendMode}`);
  if (
    layer.left !== undefined &&
    layer.top !== undefined &&
    layer.right !== undefined &&
    layer.bottom !== undefined
  ) {
    parts.push(`bounds=${layer.right - layer.left}x${layer.bottom - layer.top}@(${layer.left},${layer.top})`);
  }
  const textSnippet = layer.text ? ` — "${layer.text.replace(/\s+/g, " ").slice(0, 120)}"` : "";
  return `${indent}- ${layer.name} (${parts.join(", ")})${textSnippet}`;
}

function formatSummaryLines(
  header: PhotoshopHeader,
  info: PhotoshopDocumentInfo,
  channels: number,
  sizeBytes: number,
  layers: readonly PhotoshopLayerSummary[],
): string[] {
  const format = header.version === 2 ? "PSB (Large Document)" : "PSD";
  const lines = [
    `# Photoshop Document (${format})`,
    "",
    `- **Format**: ${header.version === 2 ? "psb" : "psd"}`,
    `- **Dimensions**: ${info.width} x ${info.height}`,
    `- **Color Mode**: ${info.colorMode}`,
    `- **Bit Depth**: ${info.depth}-bit`,
    `- **Channels**: ${channels}`,
    `- **File Size**: ${sizeBytes} bytes`,
    `- **Layers**: ${info.layerCount} total (${info.visibleLayerCount} visible)`,
  ];

  if (layers.length > 0) {
    lines.push("", "## Layers");
    for (const layer of layers) {
      lines.push(formatLayerLine(layer));
    }
  }

  return lines;
}

function formatLayersLines(layers: readonly PhotoshopLayerSummary[]): string[] {
  if (layers.length === 0) {
    return ["# Layers", "", "_No individual layers (flattened composite image)._"];
  }
  return ["# Layers", "", ...layers.map(formatLayerLine)];
}

const photoshopExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const { header, buffer } = await readPsdBuffer(context);
    let doc: ReturnType<typeof inspectPhotoshopDocument>;
    try {
      doc = inspectPhotoshopDocument(buffer);
    } catch (error) {
      mapError(error);
    }

    const metadata: Record<string, JsonValue> = {
      format: header.version === 2 ? "psb" : "psd",
      width: doc.info.width,
      height: doc.info.height,
      channels: doc.channels,
      depth: doc.info.depth,
      colorMode: doc.info.colorMode,
      sizeBytes: context.source.size,
      layerCount: doc.info.layerCount,
      visibleLayerCount: doc.info.visibleLayerCount,
    };

    const targets: TargetEntry[] = [
      { id: "summary", title: "Document summary", kind: "summary" },
      { id: "layers", title: "Layer tree", kind: "layers", size: doc.info.layerCount },
      { id: "composite", title: "Composite preview", kind: "image", size: doc.info.width * doc.info.height },
    ];

    return { metadata, targets };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const { header, buffer } = await readPsdBuffer(context);
    let doc: ReturnType<typeof inspectPhotoshopDocument>;
    try {
      doc = inspectPhotoshopDocument(buffer);
    } catch (error) {
      mapError(error);
    }

    const target = params.target ?? "summary";
    let lines: string[];
    if (target === "summary" || target === "composite") {
      lines = formatSummaryLines(header, doc.info, doc.channels, context.source.size, doc.layers);
    } else if (target === "layers") {
      lines = formatLayersLines(doc.layers);
    } else {
      throw new AgentError("target-not-found", `Photoshop target not found: "${target}".`, { pluginId: PLUGIN_ID });
    }

    let filterApplied: boolean | undefined;
    if (params.filter && params.filter.trim().length > 0) {
      const needle = params.filter.toLowerCase();
      lines = lines.filter((line) => line.toLowerCase().includes(needle));
      filterApplied = true;
    }

    const budget = Math.min(params.maxBytes, HARD_READ_MAX_BYTES);
    const page = paginateLines(lines, params.cursor, budget, PLUGIN_ID);
    return {
      content: page.content,
      contentType: "markdown",
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      truncated: page.truncated,
      ...(filterApplied !== undefined ? { filterApplied } : {}),
    };
  },

  async renderImage(
    context: ExtractContext,
    params: { readonly target?: string; readonly maxDimension: number },
  ): Promise<RgbaImage> {
    if (!Number.isFinite(params.maxDimension) || params.maxDimension < 1) {
      throw new AgentError(
        "invalid-argument",
        `maxDimension must be a positive number, received ${params.maxDimension}.`,
        { pluginId: PLUGIN_ID },
      );
    }
    const target = params.target ?? "composite";
    if (target !== "composite" && target !== "summary") {
      throw new AgentError("target-not-found", `Photoshop render target not found: "${target}".`, {
        pluginId: PLUGIN_ID,
      });
    }

    const { buffer } = await readPsdBuffer(context);
    let decoded: ReturnType<typeof decodePhotoshop>;
    try {
      decoded = decodePhotoshop(buffer);
    } catch (error) {
      mapError(error);
    }

    return downscaleRgba({ width: decoded.info.width, height: decoded.info.height, data: decoded.rgba }, params.maxDimension, PLUGIN_ID);
  },
};

export default photoshopExtractor;
