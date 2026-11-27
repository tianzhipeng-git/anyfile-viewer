import {
  AgentError,
  HARD_READ_MAX_BYTES,
  ViewerError,
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
import { ExrDocument } from "./exr-decoder";
import { isOpenExrHeader, isRadianceHdrHeader } from "./probe";
import { decodeRadianceHdr } from "./radiance-hdr";
import { DEFAULT_TONE_MAP, isLikelyEquirectangular, toneMapToRgba8 } from "./tone-map";
import {
  MAX_HDR_INPUT_BYTES,
  type HdrDecodedFrame,
  type HdrPartSummary,
} from "./types";

const PLUGIN_ID = "hdr-image";

type ParsedHdrSource =
  | { readonly kind: "openexr"; readonly doc: ExrDocument; readonly parts: readonly HdrPartSummary[] }
  | { readonly kind: "radiance-hdr"; readonly frame: HdrDecodedFrame; readonly parts: readonly HdrPartSummary[] };

function mapError(error: unknown): never {
  if (error instanceof AgentError) throw error;
  if (isViewerAbortError(error)) throw error;
  if (error instanceof ViewerError) {
    const code = error.code === "resource-limit" ? "resource-limit" : "invalid-file";
    throw new AgentError(code, error.message, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError(
    "invalid-file",
    error instanceof Error ? error.message : "Failed to decode HDR / OpenEXR image.",
    { pluginId: PLUGIN_ID, cause: error },
  );
}

async function readHdrBytes(context: ExtractContext): Promise<Uint8Array> {
  if (context.signal.aborted) throw abortError();
  if (context.source.size > MAX_HDR_INPUT_BYTES) {
    throw new AgentError(
      "resource-limit",
      `HDR file size (${(context.source.size / (1024 * 1024)).toFixed(1)} MiB) exceeds the 256 MiB limit.`,
      { pluginId: PLUGIN_ID },
    );
  }
  const bytes = await context.source.read(0, context.source.size, context.signal);
  if (context.signal.aborted) throw abortError();
  return bytes;
}

function parseHdrSource(bytes: Uint8Array): ParsedHdrSource {
  try {
    if (isOpenExrHeader(bytes)) {
      const doc = ExrDocument.parse(bytes);
      return { kind: "openexr", doc, parts: doc.getPartSummaries() };
    }
    if (isRadianceHdrHeader(bytes)) {
      const frame = decodeRadianceHdr(bytes);
      return { kind: "radiance-hdr", frame, parts: frame.parts };
    }
    throw new AgentError("invalid-file", "Unrecognized OpenEXR or Radiance HDR file.", { pluginId: PLUGIN_ID });
  } catch (error) {
    mapError(error);
  }
}

function parsePartTarget(
  target: string,
  parts: readonly HdrPartSummary[],
): { readonly partIndex: number; readonly layerId: string } {
  const match = /^part:(\d+):(.+)$/.exec(target);
  if (!match) {
    throw new AgentError("target-not-found", `HDR target not found: "${target}".`, { pluginId: PLUGIN_ID });
  }
  const partIndex = Number.parseInt(match[1], 10);
  const layerId = match[2];
  const part = parts[partIndex];
  if (!part || !part.layers.some((layer) => layer.id === layerId)) {
    throw new AgentError("target-not-found", `HDR target not found: "${target}".`, { pluginId: PLUGIN_ID });
  }
  return { partIndex, layerId };
}

function decodeTargetFrame(parsed: ParsedHdrSource, target?: string): HdrDecodedFrame {
  try {
    if (!target || target === "summary") {
      return parsed.kind === "openexr" ? parsed.doc.decodeLayer(0) : parsed.frame;
    }
    const { partIndex, layerId } = parsePartTarget(target, parsed.parts);
    if (parsed.kind === "openexr") {
      return parsed.doc.decodeLayer(partIndex, layerId);
    }
    return parsed.frame;
  } catch (error) {
    mapError(error);
  }
}

function downscaleRgba(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
): RgbaImage {
  if (!Number.isFinite(maxDimension) || maxDimension < 1) {
    throw new AgentError("invalid-argument", `maxDimension must be a positive number, received ${maxDimension}.`, {
      pluginId: PLUGIN_ID,
    });
  }
  const bound = Math.floor(maxDimension);
  if (srcWidth <= bound && srcHeight <= bound) {
    return { width: srcWidth, height: srcHeight, data: src };
  }
  const scale = bound / Math.max(srcWidth, srcHeight);
  const dstWidth = Math.max(1, Math.min(bound, Math.round(srcWidth * scale)));
  const dstHeight = Math.max(1, Math.min(bound, Math.round(srcHeight * scale)));
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);
  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y += 1) {
    const sy0 = Math.floor(y * yRatio);
    const sy1 = Math.max(sy0 + 1, Math.min(srcHeight, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < dstWidth; x += 1) {
      const sx0 = Math.floor(x * xRatio);
      const sx1 = Math.max(sx0 + 1, Math.min(srcWidth, Math.ceil((x + 1) * xRatio)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const count = (sy1 - sy0) * (sx1 - sx0);
      for (let sy = sy0; sy < sy1; sy += 1) {
        const row = sy * srcWidth;
        for (let sx = sx0; sx < sx1; sx += 1) {
          const i = (row + sx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
        }
      }
      const out = (y * dstWidth + x) * 4;
      dst[out] = Math.round(r / count);
      dst[out + 1] = Math.round(g / count);
      dst[out + 2] = Math.round(b / count);
      dst[out + 3] = Math.round(a / count);
    }
  }
  return { width: dstWidth, height: dstHeight, data: dst };
}

function formatSummaryMarkdown(frame: HdrDecodedFrame, sizeBytes: number): string[] {
  const lines: string[] = [
    `# ${frame.format === "openexr" ? "OpenEXR" : "Radiance HDR"} Image`,
    "",
    `- **Format**: ${frame.format}`,
    `- **Dimensions**: ${frame.width} x ${frame.height}`,
    `- **File Size**: ${sizeBytes} bytes`,
    `- **Active Part / Layer**: part ${frame.partIndex} / ${frame.layerId}`,
    `- **Alpha Channel**: ${frame.hasAlpha ? "yes" : "no"}`,
    `- **Equirectangular**: ${frame.isEquirectangular ? "yes" : "no"}`,
    `- **Dynamic Range**: min=${frame.dynamicRange.minLuminance.toFixed(4)}, max=${frame.dynamicRange.maxLuminance.toFixed(4)}, logAvg=${frame.dynamicRange.logAverageLuminance.toFixed(4)}, suggestedEV=${frame.dynamicRange.suggestedExposure.toFixed(1)}`,
    "",
    "## Parts & Layers",
  ];

  for (const part of frame.parts) {
    lines.push(
      `- Part ${part.index} (${part.name}): ${part.width}x${part.height}, compression=${part.compression}, tiled=${part.tiled}, channels=${part.channelCount}`,
    );
    for (const layer of part.layers) {
      lines.push(
        `  - \`part:${part.index}:${layer.id}\` — ${layer.label} (${layer.kind}, channels: ${layer.channels.join(", ")})`,
      );
    }
  }

  if (frame.metadata.length > 0) {
    lines.push("", "## Header Metadata");
    for (const entry of frame.metadata) {
      lines.push(`- **${entry.key}**: ${entry.value}`);
    }
  }

  return lines;
}

const hdrImageExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const bytes = await readHdrBytes(context);
    const parsed = parseHdrSource(bytes);
    const primary = parsed.parts[0];
    if (!primary) {
      throw new AgentError("invalid-file", "HDR image contains no readable parts.", { pluginId: PLUGIN_ID });
    }

    const targets: TargetEntry[] = [
      { id: "summary", title: "Image summary & metadata", kind: "summary" },
    ];
    for (const part of parsed.parts) {
      for (const layer of part.layers) {
        targets.push({
          id: `part:${part.index}:${layer.id}`,
          title: parsed.parts.length > 1 ? `${part.name} / ${layer.label}` : layer.label,
          kind: "layer",
          size: part.width * part.height,
        });
      }
    }

    const metadata: Record<string, JsonValue> = {
      format: parsed.kind,
      width: primary.width,
      height: primary.height,
      sizeBytes: context.source.size,
      compression: primary.compression,
      tiled: primary.tiled,
      partCount: parsed.parts.length,
      channelCount: primary.channelCount,
      layers: primary.layers.map((layer) => layer.id),
      isEquirectangular: isLikelyEquirectangular(primary.width, primary.height, primary.envmap),
      ...(primary.envmap ? { envmap: primary.envmap } : {}),
    };

    return { metadata, targets };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const bytes = await readHdrBytes(context);
    const parsed = parseHdrSource(bytes);
    const frame = decodeTargetFrame(parsed, params.target);

    let lines = formatSummaryMarkdown(frame, context.source.size);
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
    const bytes = await readHdrBytes(context);
    const parsed = parseHdrSource(bytes);
    const frame = decodeTargetFrame(parsed, params.target);

    const rgba8 = new Uint8ClampedArray(frame.width * frame.height * 4);
    toneMapToRgba8(frame.rgba, rgba8, {
      ...DEFAULT_TONE_MAP,
      exposure: frame.dynamicRange.suggestedExposure,
    });

    return downscaleRgba(rgba8, frame.width, frame.height, params.maxDimension);
  },
};

export default hdrImageExtractor;
