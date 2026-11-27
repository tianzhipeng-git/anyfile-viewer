import { parseDicom, readPart10Header, type DataSet } from "./dicom-parser";
import {
  AgentError,
  HARD_READ_MAX_BYTES,
  ViewerError,
  abortError,
  isViewerAbortError,
  paginateLines,
  parsePageTarget,
  parsePositionCursor,
  renderMarkdownTablePage,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type RgbaImage,
  type StructuredExtractor,
  type TargetEntry,
} from "@anyfile/viewer-protocol";

import { renderFrame } from "./decoder";
import { downscaleRgba } from "./downscale";
import { inspectDicom, isParseableSyntax, type DicomSource } from "./header";
import { dicomTagRows, type TagRow } from "./tag-table";
import { MAX_HEADER_BYTES } from "./types";

const PLUGIN_ID = "dicom";
const MAX_FRAME_TARGETS = 1000;
const BIG_ENDIAN = "1.2.840.10008.1.2.2";
const SYNTAX_NAMES: Record<string, string> = {
  "1.2.840.10008.1.2": "Implicit VR Little Endian",
  "1.2.840.10008.1.2.1": "Explicit VR Little Endian",
  "1.2.840.10008.1.2.1.99": "Deflated Explicit VR Little Endian",
  "1.2.840.10008.1.2.2": "Explicit VR Big Endian",
  "1.2.840.10008.1.2.4.50": "JPEG Baseline",
  "1.2.840.10008.1.2.4.57": "JPEG Lossless",
  "1.2.840.10008.1.2.4.70": "JPEG Lossless SV1",
  "1.2.840.10008.1.2.4.80": "JPEG-LS Lossless",
  "1.2.840.10008.1.2.4.81": "JPEG-LS Near-Lossless",
  "1.2.840.10008.1.2.4.90": "JPEG 2000 Lossless",
  "1.2.840.10008.1.2.4.91": "JPEG 2000",
  "1.2.840.10008.1.2.5": "RLE Lossless",
};
/** Descriptive study/series tags exposed by `inspect`; patient identifiers are never included. */
const DESCRIPTIVE_TAGS: Record<string, string> = {
  studyDescription: "x00081030",
  seriesDescription: "x0008103e",
  bodyPartExamined: "x00180015",
  manufacturer: "x00080070",
  manufacturerModelName: "x00081090",
  seriesNumber: "x00200011",
  instanceNumber: "x00200013",
  imageType: "x00080008",
};
const REASONS: Record<string, string> = {
  syntax: "this transfer syntax needs a codec that is not available (compressed or deflated pixel data)",
  pixels: "this pixel format (palette, YBR, 1-bit, float...) is not supported",
  transform: "this image uses Modality/VOI LUT or per-frame transformations",
  noImage: "the file contains no image pixel data",
};

interface Loaded {
  readonly dicom: DicomSource;
  readonly data: DataSet;
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ViewerError) {
    throw new AgentError(error.code === "resource-limit" ? "resource-limit" : "invalid-file", error.message, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "Invalid DICOM data.", { pluginId: PLUGIN_ID, cause: error });
}

async function guarded<T>(context: ExtractContext, run: () => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  try {
    return await run();
  } catch (error) {
    if (context.signal.aborted) throw abortError();
    mapError(error);
  }
}

async function load(context: ExtractContext): Promise<Loaded> {
  const { source, signal } = context;
  const bytes = await source.read(0, Math.min(source.size, MAX_HEADER_BYTES), signal);
  const dicom = inspectDicom(bytes, source.size);
  // Deflated/unknown data sets: only the file meta group is parsed.
  const data = isParseableSyntax(dicom.info.syntax)
    ? parseDicom(bytes, { untilTag: "x7fe00010" })
    : readPart10Header(bytes);
  return { dicom, data };
}

const frameCount = ({ dicom }: Loaded) => (dicom.info.reason ? 0 : dicom.info.frames);

function frameLines({ dicom }: Loaded, index: number): string[] {
  const { info } = dicom;
  const window = dicom.window ? `center ${dicom.window.center}, width ${dicom.window.width}` : "automatic (pixel range)";
  return [
    `# Frame ${index + 1} / ${info.frames}`,
    "",
    `- **Dimensions**: ${info.width} x ${info.height}`,
    `- **Photometric interpretation**: ${info.photometric}`,
    `- **Bits allocated / stored**: ${info.bits} / ${dicom.stored}`,
    `- **Rescale**: slope ${dicom.slope}, intercept ${dicom.intercept}`,
    `- **Default window**: ${window} (${dicom.voi})`,
    `- **Pixel data offset**: ${dicom.offset + index * dicom.frameBytes} (${dicom.frameBytes} bytes)`,
  ];
}

function readTags(loaded: Loaded, params: ReadParams, maxBytes: number): ReadResult {
  const rows = dicomTagRows(loaded.data, loaded.dicom.info.syntax === BIG_ENDIAN);
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  if (start > rows.length) throw new AgentError("target-not-found", `Cursor row ${start} is out of range.`, { pluginId: PLUGIN_ID });
  const needle = params.filter?.trim().toLowerCase();
  const matches = (row: TagRow) => !needle || row.some((cell) => cell.toLowerCase().includes(needle));
  const page = renderMarkdownTablePage({
    columns: ["Tag", "Keyword", "VR", "Value"],
    rows: rows.slice(start).map((row) => (matches(row) ? row : null)),
    start,
    maxBytes,
    cursorPrefix: "row:",
  });
  return needle ? { ...page, filterApplied: true } : page;
}

const dicomExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return guarded(context, async () => {
      const loaded = await load(context);
      const { dicom, data } = loaded;
      const { info } = dicom;
      const metadata: Record<string, JsonValue> = {
        transferSyntax: info.syntax,
        ...(SYNTAX_NAMES[info.syntax] ? { transferSyntaxName: SYNTAX_NAMES[info.syntax] } : {}),
        sopClassUID: info.sopClass,
        modality: info.modality,
        studyDate: info.date,
      };
      for (const [name, tag] of Object.entries(DESCRIPTIVE_TAGS)) {
        const value = data.string(tag);
        if (value) metadata[name] = value;
      }
      Object.assign(metadata, {
        rows: info.height,
        columns: info.width,
        frames: info.frames,
        bitsAllocated: info.bits,
        ...(dicom.stored ? { bitsStored: dicom.stored } : {}),
        samplesPerPixel: data.uint16("x00280002") ?? null,
        photometricInterpretation: info.photometric,
        ...(dicom.window ? { windowCenter: dicom.window.center, windowWidth: dicom.window.width } : {}),
        renderable: !info.reason,
        ...(info.reason ? { metadataOnlyReason: REASONS[info.reason] } : {}),
        identifyingTagsMasked: true,
        sizeBytes: context.source.size,
      });
      const frames = frameCount(loaded);
      const targets: TargetEntry[] = [{ id: "tags", title: "DICOM tag table (identifying values masked)", kind: "table" }];
      for (let index = 0; index < Math.min(frames, MAX_FRAME_TARGETS); index += 1) {
        targets.push({ id: `frame:${index + 1}`, title: `Frame ${index + 1}`, kind: "frame" });
      }
      return { metadata, targets, ...(frames > MAX_FRAME_TARGETS ? { targetsTruncated: true } : {}) };
    });
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return guarded(context, async () => {
      const loaded = await load(context);
      const maxBytes = Math.min(params.maxBytes, HARD_READ_MAX_BYTES);
      if (params.target === undefined || params.target === "tags") return readTags(loaded, params, maxBytes);
      const index = parsePageTarget(params.target, frameCount(loaded), PLUGIN_ID, "frame");
      const needle = params.filter?.trim().toLowerCase();
      const lines = frameLines(loaded, index).filter((line) => !needle || line.toLowerCase().includes(needle));
      return { contentType: "markdown", ...paginateLines(lines, params.cursor, maxBytes, PLUGIN_ID), ...(needle ? { filterApplied: true } : {}) };
    });
  },

  renderImage(context: ExtractContext, params: { readonly target?: string; readonly maxDimension: number }): Promise<RgbaImage> {
    return guarded(context, async () => {
      if (!Number.isFinite(params.maxDimension) || params.maxDimension < 1) {
        throw new AgentError("invalid-argument", `maxDimension must be a positive number, received ${params.maxDimension}.`, { pluginId: PLUGIN_ID });
      }
      const loaded = await load(context);
      const { dicom } = loaded;
      if (dicom.info.reason) {
        throw new AgentError("unsupported-capability", `Metadata only: ${REASONS[dicom.info.reason]}.`, { pluginId: PLUGIN_ID });
      }
      const index = params.target === undefined ? 0 : parsePageTarget(params.target, frameCount(loaded), PLUGIN_ID, "frame");
      const offset = dicom.offset + index * dicom.frameBytes;
      const bytes = await context.source.read(offset, dicom.frameBytes, context.signal);
      const { rgba } = renderFrame(dicom, bytes);
      return downscaleRgba({ width: dicom.info.width, height: dicom.info.height, data: rgba }, params.maxDimension, PLUGIN_ID);
    });
  },
};

export default dicomExtractor;
