import {
  LIBRAW_DEVELOP_SETTINGS,
  MAX_RAW_SOURCE_BYTES,
  checkRawDimensions,
  loadLibRawFromVendor,
  type LibRawNodeInstance,
  type LibRawNodeModule,
} from "@anyfile/raw-decoder";
import {
  downscaleRgba,
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
} from "@anyfile/viewer-protocol";
import { inspectRawHeader } from "./probe-format";

const PLUGIN_ID = "camera-raw";
const PROBE_BYTES = 1024 * 1024;
const THUMB_FORMATS = ["unknown", "jpeg", "bitmap", "bitmap16", "layer", "rollei", "h265"];

let runtime: Promise<LibRawNodeModule> | undefined;

/** One LibRaw wasm instance per worker, loaded from the local vendor cache; each call opens a fresh `LibRaw`. */
function loadRuntime(context: ExtractContext): Promise<LibRawNodeModule> {
  runtime ??= loadLibRawFromVendor(context.vendor).catch((error: unknown) => {
    runtime = undefined;
    throw new AgentError("runtime-unavailable", `LibRaw runtime failed to load: ${error instanceof Error ? error.message : String(error)}`, { pluginId: PLUGIN_ID, cause: error });
  });
  return runtime;
}

function fail(code: AgentError["code"], message: string, cause?: unknown): never {
  throw new AgentError(code, message, { pluginId: PLUGIN_ID, cause });
}

async function withRaw<T>(context: ExtractContext, halfSize: boolean, run: (raw: LibRawNodeInstance, format: string) => T): Promise<T> {
  if (context.signal.aborted) throw abortError();
  const { source, signal } = context;
  if (source.size > MAX_RAW_SOURCE_BYTES) fail("resource-limit", "RAW file exceeds the 256 MiB input limit.");
  const header = inspectRawHeader(await source.read(0, PROBE_BYTES, signal), source.name);
  if (!header) fail("invalid-file", "Not a supported camera RAW file.");
  const { LibRaw } = await loadRuntime(context);
  const bytes = await source.read(0, source.size, signal);
  if (signal.aborted) throw abortError();
  const raw = new LibRaw();
  try {
    raw.open(bytes, { ...LIBRAW_DEVELOP_SETTINGS, halfSize });
    return run(raw, header.format);
  } catch (error) {
    if (error instanceof AgentError || isViewerAbortError(error)) throw error;
    if (error instanceof ViewerError) fail(error.code === "resource-limit" ? "resource-limit" : "invalid-file", error.message, error);
    if (error instanceof RangeError) fail("resource-limit", "RAW decoding exceeded the memory limit.", error);
    return fail("invalid-file", `LibRaw could not decode this file${error instanceof Error && error.message ? `: ${error.message}` : "."}`, error);
  } finally {
    raw.delete?.();
  }
}

function parseJson(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const positive = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value * 1e4) / 1e4 : undefined);

function shutterText(seconds: number | undefined) {
  if (seconds === undefined) return undefined;
  return seconds >= 1 ? `${seconds}s` : `1/${Math.round(1 / seconds)}s`;
}

/** Flattens LibRaw metadata into the Agent-facing summary; zero / empty values mean "not recorded". */
function summarize(md: Record<string, unknown>, format: string): Record<string, JsonValue> {
  const lens = parseJson(md.lens);
  const makernotes = parseJson(lens.makernotes);
  const gps = parseJson(md.gps_data);
  const shooting = parseJson(md.shootinginfo);
  const flip = typeof md.flip === "number" ? md.flip : 0;
  const turned = flip === 5 || flip === 6;
  const width = Number(md.width);
  const height = Number(md.height);
  const thumbWidth = positive(md.thumb_width);
  const thumbHeight = positive(md.thumb_height);
  const timestamp = positive(md.timestamp);
  const shutter = positive(md.shutter);
  const entries: Record<string, JsonValue | undefined> = {
    format,
    make: text(md.camera_make),
    model: text(md.camera_model),
    lens: text(lens.Lens) ?? text(makernotes.Lens),
    lensMake: text(lens.LensMake),
    iso: positive(md.iso_speed),
    shutter: shutterText(shutter),
    exposureSeconds: shutter,
    aperture: positive(md.aperture),
    focalLength: positive(md.focal_len),
    timestamp: timestamp ? new Date(timestamp * 1000).toISOString() : undefined,
    width: turned ? height : width,
    height: turned ? width : height,
    rawWidth: positive(md.raw_width),
    rawHeight: positive(md.raw_height),
    ...(flip ? { flip } : {}),
    colors: positive(md.colors),
    cfaPattern: text(md.cdesc),
    dngVersion: positive(md.dng_version) ? [...new Uint8Array(new Uint32Array([Number(md.dng_version)]).buffer)].reverse().join(".") : undefined,
    embeddedPreview: thumbWidth && thumbHeight ? { width: thumbWidth, height: thumbHeight, format: THUMB_FORMATS[Number(md.thumb_format)] ?? "unknown" } : null,
    software: text(md.software),
    artist: text(md.artist),
    description: text(md.desc),
    bodySerial: text(shooting.BodySerial),
    gps: gps.gpsparsed === true,
  };
  return Object.fromEntries(Object.entries(entries).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined));
}

function checkTarget(target: string | undefined) {
  if (target !== undefined && target !== "metadata") fail("target-not-found", `RAW target not found: "${target}".`);
}

function formatValue(value: JsonValue): string {
  return value && typeof value === "object" ? JSON.stringify(value) : String(value);
}

const cameraRawExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const metadata = await withRaw(context, true, (raw, format) => summarize(raw.metadata(true) ?? {}, format));
    return { metadata, targets: [{ id: "metadata", title: "Camera & capture metadata", kind: "metadata" }] };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    checkTarget(params.target);
    const metadata = await withRaw(context, true, (raw, format) => summarize(raw.metadata(true) ?? {}, format));
    let lines = [`# Camera RAW (${String(metadata.format)})`, "", ...Object.entries(metadata).map(([key, value]) => `- **${key}**: ${formatValue(value)}`)];
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

  /** Half-size LibRaw development (camera WB + matrix, sRGB, file orientation); embedded JPEG previews need a JPEG decoder Node lacks. */
  async renderImage(context: ExtractContext, params: { readonly target?: string; readonly maxDimension: number }): Promise<RgbaImage> {
    if (!Number.isFinite(params.maxDimension) || params.maxDimension < 1) {
      fail("invalid-argument", `maxDimension must be a positive number, received ${params.maxDimension}.`);
    }
    checkTarget(params.target);
    return withRaw(context, true, (raw) => {
      const md = raw.metadata(false) ?? {};
      checkRawDimensions(Number(md.width), Number(md.height));
      const image = raw.imageData();
      if (!image || image.bits !== 8 || (image.colors !== 3 && image.colors !== 4)) fail("invalid-file", "LibRaw returned no 8-bit RGB development.");
      const pixels = checkRawDimensions(image.width, image.height);
      if (image.data.length !== pixels * image.colors) fail("invalid-file", "LibRaw pixel buffer length is invalid.");
      const rgba = new Uint8ClampedArray(pixels * 4);
      for (let from = 0, to = 0; to < rgba.length; from += image.colors, to += 4) {
        rgba[to] = image.data[from];
        rgba[to + 1] = image.data[from + 1];
        rgba[to + 2] = image.data[from + 2];
        rgba[to + 3] = image.colors === 4 ? image.data[from + 3] : 255;
      }
      return downscaleRgba({ width: image.width, height: image.height, data: rgba }, params.maxDimension, PLUGIN_ID);
    });
  },
};

export default cameraRawExtractor;
