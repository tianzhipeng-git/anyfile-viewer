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
import { parseExifPayload, type ExifSummary } from "./exif";
import { readHeifMetadata } from "./heif-meta";
import { classifyHeifError } from "./heif-runtime";
import { MAX_HEIF_SOURCE_BYTES, MAX_JXL_FRAMES, MAX_MODERN_RASTER_SOURCE_BYTES, PROBE_BYTES, checkDimensions } from "./limits";
import { downscaleRgba, loadHeifDecoder, openJxl, renderJxlFrame, type JxlSession } from "./node-decode";
import { inspectModernHeader, type ModernFormat } from "./probe-format";

const PLUGIN_ID = "modern-raster";
const MAX_FRAME_TARGETS = 64;
const MAX_EXIF_BOX_BYTES = 1024 * 1024;

function fail(code: AgentError["code"], message: string, cause?: unknown): never {
  throw new AgentError(code, message, { pluginId: PLUGIN_ID, cause });
}

function mapError(error: unknown, fallback: string): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ViewerError) fail(error.code === "resource-limit" ? "resource-limit" : "invalid-file", error.message, error);
  const code = classifyHeifError(error);
  if (code === "resource-limit") fail("resource-limit", "Image decoding exceeded the memory limit.", error);
  fail("invalid-file", error instanceof Error && error.message ? error.message : fallback, error);
}

async function detect(context: ExtractContext): Promise<ModernFormat> {
  if (context.signal.aborted) throw abortError();
  const { source, signal } = context;
  if (source.size > MAX_MODERN_RASTER_SOURCE_BYTES) fail("resource-limit", "Image exceeds the 256 MiB input limit.");
  const format = source.size > 0 ? inspectModernHeader(await source.read(0, PROBE_BYTES, signal), source.size) : undefined;
  if (!format) fail("invalid-file", "Not a valid JPEG XL or HEVC-coded HEIF/HEIC image.");
  if (format === "HEIC" && source.size > MAX_HEIF_SOURCE_BYTES) fail("resource-limit", "HEIF image exceeds the 128 MiB input limit.");
  return format;
}

async function readAll(context: ExtractContext) {
  const bytes = await context.source.read(0, context.source.size, context.signal);
  if (context.signal.aborted) throw abortError();
  return bytes;
}

async function withJxl<T>(context: ExtractContext, run: (session: JxlSession) => T | Promise<T>): Promise<T> {
  let session: JxlSession | undefined;
  try {
    session = await openJxl(context.source, context.signal);
    if (session.frameCount > MAX_JXL_FRAMES) fail("resource-limit", "JPEG XL animation exceeds the 4096 frame limit.");
    return await run(session);
  } catch (error) {
    return mapError(error, "JPEG XL image could not be decoded.");
  } finally {
    session?.image.free();
  }
}

/** Reads the `Exif` box of a JPEG XL container (bare codestreams carry no EXIF). */
async function readJxlExif(context: ExtractContext): Promise<ExifSummary | undefined> {
  const { source, signal } = context;
  for (let offset = 0, boxes = 0; offset + 8 <= source.size && boxes < 256; boxes++) {
    const header = new DataView((await source.read(offset, 16, signal)).slice().buffer);
    if (header.byteLength < 8 || (offset === 0 && header.getUint32(4) !== 0x4a584c20)) return undefined;
    const size32 = header.getUint32(0);
    const type = String.fromCharCode(header.getUint8(4), header.getUint8(5), header.getUint8(6), header.getUint8(7));
    const headerSize = size32 === 1 ? 16 : 8;
    const size = size32 === 0 ? source.size - offset : size32 === 1 ? Number(header.getBigUint64(8)) : size32;
    if (size < headerSize) return undefined;
    if (type === "Exif" && size - headerSize <= MAX_EXIF_BOX_BYTES) {
      return parseExifPayload(await source.read(offset + headerSize, size - headerSize, signal));
    }
    offset += size;
  }
  return undefined;
}

interface Described {
  readonly metadata: Record<string, JsonValue>;
  readonly frameCount: number;
}

async function describe(context: ExtractContext): Promise<Described> {
  const format = await detect(context);
  const base = { format: format === "JXL" ? "JPEG XL" : "HEIC", sizeBytes: context.source.size };
  if (format === "HEIC") {
    const meta = readHeifMetadata(await readAll(context));
    if (!meta || meta.width === undefined || meta.height === undefined) fail("invalid-file", "HEIF container has no readable primary image.");
    const turned = meta.rotation === 90 || meta.rotation === 270;
    const metadata: Record<string, JsonValue> = {
      ...base,
      width: turned ? meta.height : meta.width,
      height: turned ? meta.width : meta.height,
      ...(meta.bitDepth !== undefined ? { bitDepth: meta.bitDepth } : {}),
      hasAlpha: meta.hasAlpha,
      hasDepth: meta.hasDepth,
      ...(meta.primaryCodec ? { primaryCodec: meta.primaryCodec } : {}),
      brands: [...meta.brands],
      imageCount: meta.imageCount,
      thumbnailCount: meta.thumbnailCount,
      itemCount: meta.itemCount,
      ...(meta.rotation ? { rotation: meta.rotation } : {}),
      ...(meta.mirrored ? { mirrored: true } : {}),
      ...(meta.colorProfile ? { colorProfile: meta.colorProfile } : {}),
      ...(meta.exif ? { exif: meta.exif } : {}),
    };
    return { metadata, frameCount: 1 };
  }
  const exif = await readJxlExif(context);
  return withJxl(context, (session) => {
    // Render a 1x1 region only: jxl-oxide reports bit depth and alpha through its PNG output.
    session.image.renderingRegion = { left: 0, top: 0, width: 1, height: 1 };
    const probe = renderJxlFrame(session, 0);
    const metadata: Record<string, JsonValue> = {
      ...base,
      width: session.width,
      height: session.height,
      bitDepth: probe.bitDepth,
      hasAlpha: probe.hasAlpha,
      animated: session.animated,
      frameCount: session.frameCount,
      ...(session.animated ? { loops: session.loops } : {}),
      ...(exif ? { exif } : {}),
    };
    return { metadata, frameCount: session.frameCount };
  });
}

function buildTargets(frameCount: number): { targets: TargetEntry[]; truncated: boolean } {
  const targets: TargetEntry[] = [{ id: "metadata", title: "Image metadata", kind: "metadata" }];
  if (frameCount > 1) {
    for (let index = 0; index < Math.min(frameCount, MAX_FRAME_TARGETS); index++) {
      targets.push({ id: `frame:${index}`, title: `Frame ${index + 1}`, kind: "frame" });
    }
  }
  return { targets, truncated: frameCount > MAX_FRAME_TARGETS };
}

/** `undefined` / `metadata` select the primary image (frame 0); `frame:<n>` selects an animation keyframe. */
function resolveFrame(target: string | undefined, frameCount: number): number {
  if (target === undefined || target === "metadata") return 0;
  const match = /^frame:(\d+)$/.exec(target);
  const index = match ? Number(match[1]) : -1;
  if (frameCount <= 1 || index < 0 || index >= frameCount) fail("target-not-found", `Image target not found: "${target}".`);
  return index;
}

function formatValue(value: JsonValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function metadataLines(metadata: Record<string, JsonValue>, frame?: number): string[] {
  const { exif, ...fields } = metadata;
  const lines = [`# ${String(metadata.format)} image${frame === undefined ? "" : ` — frame ${frame + 1}`}`, ""];
  for (const [key, value] of Object.entries(fields)) lines.push(`- **${key}**: ${formatValue(value)}`);
  if (exif && typeof exif === "object" && !Array.isArray(exif)) {
    lines.push("", "## EXIF");
    for (const [key, value] of Object.entries(exif)) lines.push(`- **${key}**: ${formatValue(value)}`);
  }
  if (frame !== undefined) lines.push("", "Use `render` with this target to view the frame pixels.");
  return lines;
}

const modernRasterExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const { metadata, frameCount } = await describe(context);
    const { targets, truncated } = buildTargets(frameCount);
    return { metadata, targets, ...(truncated ? { targetsTruncated: true } : {}) };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const { metadata, frameCount } = await describe(context);
    const frame = params.target?.startsWith("frame:") ? resolveFrame(params.target, frameCount) : undefined;
    if (params.target !== undefined && params.target !== "metadata" && frame === undefined) {
      fail("target-not-found", `Image target not found: "${params.target}".`);
    }
    let lines = metadataLines(metadata, frame);
    const filter = params.filter?.trim().toLowerCase();
    if (filter) lines = lines.filter((line) => line.toLowerCase().includes(filter));
    const page = paginateLines(lines, params.cursor, Math.min(params.maxBytes, HARD_READ_MAX_BYTES), PLUGIN_ID);
    return {
      content: page.content,
      contentType: "markdown",
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
      truncated: page.truncated,
      ...(filter ? { filterApplied: true } : {}),
    };
  },

  async renderImage(context: ExtractContext, params: { readonly target?: string; readonly maxDimension: number }): Promise<RgbaImage> {
    if (!Number.isFinite(params.maxDimension) || params.maxDimension < 1) {
      fail("invalid-argument", `maxDimension must be a positive number, received ${params.maxDimension}.`);
    }
    const format = await detect(context);
    if (format === "JXL") {
      return withJxl(context, (session) => {
        const frame = renderJxlFrame(session, resolveFrame(params.target, session.frameCount));
        return downscaleRgba(frame.rgba, frame.width, frame.height, params.maxDimension);
      });
    }
    resolveFrame(params.target, 1);
    const bytes = await readAll(context);
    let decoder;
    try {
      decoder = await loadHeifDecoder(context.vendor);
    } catch (error) {
      fail("runtime-unavailable", `libheif runtime failed to load: ${error instanceof Error ? error.message : String(error)}`, error);
    }
    if (context.signal.aborted) throw abortError();
    try {
      const decoded = decoder.decodePrimary(bytes);
      checkDimensions(decoded.width, decoded.height);
      return downscaleRgba(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height, params.maxDimension);
    } catch (error) {
      return mapError(error, "HEIF primary image could not be decoded.");
    }
  },
};

export default modernRasterExtractor;
