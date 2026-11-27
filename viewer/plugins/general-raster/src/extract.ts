import {
  downscaleRgba,
  AgentError,
  ViewerError,
  abortError,
  escapeMarkdownCell,
  isViewerAbortError,
  markdownDocumentHeader,
  parsePageTarget,
  readPagedTextDocument,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type RgbaImage,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";
import type { GeoTIFF } from "geotiff";

import { decodePnm } from "./decode-pnm";
import { decodeTga } from "./decode-tga";
import { MAX_SOURCE_BYTES, MAX_TIFF_PAGES, PROBE_BYTES } from "./limits";
import { inspectRasterHeader } from "./probe-format";
import type { DecodedRaster } from "./types";

// geotiff is loaded only for TIFF input so TGA/Netpbm never evaluate it.
type TiffModule = typeof import("./tiff-metadata");

const PLUGIN_ID = "general-raster";

type Loaded =
  | { readonly kind: "tiff"; readonly format: "TIFF" | "BigTIFF"; readonly tiff: GeoTIFF; readonly pageCount: number; readonly lib: TiffModule }
  | { readonly kind: "raster"; readonly raster: DecodedRaster };

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ViewerError) {
    throw new AgentError(error.code === "resource-limit" ? "resource-limit" : "invalid-file", error.message, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", error instanceof Error ? error.message : "Failed to decode raster image.", { pluginId: PLUGIN_ID, cause: error });
}

async function guarded<T>(context: ExtractContext, run: () => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  try {
    const result = await run();
    if (context.signal.aborted) throw abortError();
    return result;
  } catch (error) {
    if (context.signal.aborted) throw abortError();
    mapError(error);
  }
}

async function load(context: ExtractContext): Promise<Loaded> {
  const { source, signal } = context;
  const header = await source.read(0, Math.min(PROBE_BYTES, source.size), signal);
  const probe = inspectRasterHeader(header, source.size);
  if (!probe) throw new AgentError("invalid-file", "Not a supported TGA, Netpbm or TIFF image.", { pluginId: PLUGIN_ID });
  if (probe.format === "TIFF" || probe.format === "BigTIFF") {
    const lib = await import("./tiff-metadata");
    const tiff = await lib.openTiffFromSource(source, signal);
    const pageCount = await tiff.getImageCount();
    if (pageCount < 1 || pageCount > MAX_TIFF_PAGES) {
      throw new AgentError("resource-limit", `TIFF page count exceeds the ${MAX_TIFF_PAGES} page limit.`, { pluginId: PLUGIN_ID });
    }
    return { kind: "tiff", format: probe.format, tiff, pageCount, lib };
  }
  if (source.size > MAX_SOURCE_BYTES) {
    throw new AgentError("resource-limit", "TGA/Netpbm input exceeds the 256 MiB limit.", { pluginId: PLUGIN_ID });
  }
  const bytes = await source.read(0, source.size, signal);
  return { kind: "raster", raster: probe.format === "TGA" ? decodeTga(bytes) : decodePnm(bytes) };
}

const pageCountOf = (loaded: Loaded) => (loaded.kind === "tiff" ? loaded.pageCount : 1);

/** Page facts without decoding pixels; width/height are as displayed (after TIFF orientation). */
async function pageInfo(loaded: Loaded, index: number): Promise<Record<string, JsonValue>> {
  if (loaded.kind === "raster") {
    const { format, width, height, bitDepth, hasAlpha } = loaded.raster;
    return { format, width, height, bitDepth, hasAlpha };
  }
  return loaded.lib.tiffPageInfo(await loaded.tiff.getImage(index), loaded.format);
}

const bullet = (name: string, value: JsonValue) =>
  `- **${name}**: ${escapeMarkdownCell(typeof value === "object" && value !== null ? JSON.stringify(value) : value)}`;

async function pageMarkdown(loaded: Loaded, index: number): Promise<string> {
  const { geo, ...info } = await pageInfo(loaded, index);
  const lines = [`## Page ${index + 1}`, "", ...Object.entries(info).map(([name, value]) => bullet(name, value))];
  if (geo && typeof geo === "object" && !Array.isArray(geo)) {
    lines.push("", "### GeoTIFF", "", ...Object.entries(geo).map(([name, value]) => bullet(name, value)));
  }
  if (loaded.kind === "tiff") {
    const image = await loaded.tiff.getImage(index);
    lines.push("", "### TIFF tags", "", ...(await loaded.lib.tiffTagRows(image)).map(([name, value]) => bullet(name, value)));
  }
  return lines.join("\n");
}

const generalRasterExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return guarded(context, async () => {
      const loaded = await load(context);
      const pageCount = pageCountOf(loaded);
      const targets: TargetEntry[] = [{ id: "metadata", title: "Image metadata and tags", kind: "metadata" }];
      for (let index = 0; index < pageCount; index += 1) targets.push({ id: `page:${index + 1}`, title: `Page ${index + 1}`, kind: "page" });
      return { metadata: { ...(await pageInfo(loaded, 0)), pageCount, sizeBytes: context.source.size }, targets };
    });
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return guarded(context, async () => {
      const loaded = await load(context);
      const pageCount = pageCountOf(loaded);
      const first = await pageInfo(loaded, 0);
      return readPagedTextDocument(
        {
          pageCount,
          header: () => markdownDocumentHeader(`${String(first.format)} image`, {
            Dimensions: `${String(first.width)} x ${String(first.height)}`,
            Pages: String(pageCount),
            "File size": `${context.source.size} bytes`,
          }),
          page: (index) => pageMarkdown(loaded, index),
        },
        { ...params, target: params.target === "metadata" ? undefined : params.target },
        PLUGIN_ID,
      );
    });
  },

  renderImage(context: ExtractContext, params: { readonly target?: string; readonly maxDimension: number }): Promise<RgbaImage> {
    return guarded(context, async () => {
      if (!Number.isFinite(params.maxDimension) || params.maxDimension < 1) {
        throw new AgentError("invalid-argument", `maxDimension must be a positive number, received ${params.maxDimension}.`, { pluginId: PLUGIN_ID });
      }
      const loaded = await load(context);
      const index = params.target === undefined ? 0 : parsePageTarget(params.target, pageCountOf(loaded), PLUGIN_ID);
      const raster = loaded.kind === "tiff"
        ? await loaded.lib.decodeTiffDocument(loaded.tiff, index, context.signal, loaded.format === "BigTIFF")
        : loaded.raster;
      return downscaleRgba({ width: raster.width, height: raster.height, data: raster.rgba }, params.maxDimension, PLUGIN_ID);
    });
  },
};

export default generalRasterExtractor;
