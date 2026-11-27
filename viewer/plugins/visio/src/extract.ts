import { importRuntime } from "@anyfile/runtime-assets";
import { parseXmlDocument } from "@anyfile/runtime-assets/xml";
import {
  AgentError,
  abortError,
  isViewerAbortError,
  paginateLines,
  type ExtractContext,
  type InspectPayload,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";
import { EngineError, openDrawing, pageSvg, type VisioModule } from "./engine";
import { INPUT_LIMIT, RUNTIME_BASE } from "./types";

const PLUGIN_ID = "visio";
/** Vendor path of the same libvisio build the Web viewer loads from `/vendor/`. */
const VENDOR_DIR = RUNTIME_BASE.replace(/^\/vendor\//, "");
const PRIMITIVES = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "image"]);

interface PageSummary {
  readonly width: number | null;
  readonly height: number | null;
  readonly groups: number;
  readonly elements: number;
  readonly texts: readonly string[];
}

let runtime: Promise<VisioModule> | undefined;

/** One libvisio instance per worker; it holds only the drawing last opened, so every call re-opens. */
function loadRuntime(context: ExtractContext): Promise<VisioModule> {
  runtime ??= (async () => {
    const { default: create } = await importRuntime<{ default(options: Record<string, unknown>): Promise<VisioModule> }>(
      await context.vendor.url(`${VENDOR_DIR}visio.mjs`),
    );
    const visio = await create({ wasmBinary: await context.vendor.bytes(`${VENDOR_DIR}visio.wasm`), print: () => {}, printErr: () => {} });
    visio.setIcuData(await context.vendor.bytes(`${VENDOR_DIR}converters.dat`));
    return visio;
  })().catch((error: unknown) => {
    runtime = undefined;
    throw new AgentError("runtime-unavailable", `libvisio runtime failed to load: ${error instanceof Error ? error.message : String(error)}`, { pluginId: PLUGIN_ID, cause: error });
  });
  return runtime;
}

/** libvisio/librevenge emits page sizes in inches, one `<text>` per text block and `<g>` per group. */
function summarize(svg: string): PageSummary {
  const document = parseXmlDocument(svg, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || document.querySelector("parsererror")) throw new EngineError("invalid-file");
  const inches = (name: string) => {
    const value = root.getAttribute(name) ?? "";
    return /^\d+(?:\.\d+)?in$/.test(value) ? Number(Number.parseFloat(value).toFixed(2)) : null;
  };
  const all = Array.from(root.getElementsByTagName("*"));
  return {
    width: inches("width"),
    height: inches("height"),
    groups: all.filter((element) => element.localName === "g").length,
    elements: all.filter((element) => PRIMITIVES.has(element.localName) && !element.closest("defs")).length,
    texts: all
      .filter((element) => element.localName === "text")
      .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
  };
}

/** Opens the drawing and summarizes the requested pages (all when `only` is omitted). */
async function openPages(context: ExtractContext, only?: number) {
  if (context.signal.aborted) throw abortError();
  const { source } = context;
  if (source.size > INPUT_LIMIT) throw new AgentError("resource-limit", "The drawing exceeds the Visio size limit.", { pluginId: PLUGIN_ID });
  const visio = await loadRuntime(context);
  const bytes = await source.read(0, source.size, context.signal);
  if (context.signal.aborted) throw abortError();
  try {
    const count = openDrawing(visio, bytes);
    if (only !== undefined && only >= count) throw new AgentError("target-not-found", `Page ${only + 1} does not exist.`, { pluginId: PLUGIN_ID });
    const indexes = only === undefined ? Array.from({ length: count }, (_, index) => index) : [only];
    const pages = indexes.map((index) => ({ index, ...summarize(pageSvg(visio, index)) }));
    return { format: bytes[0] === 0x50 && bytes[1] === 0x4b ? "vsdx" : "vsd", count, pages };
  } catch (error) {
    if (error instanceof AgentError || isViewerAbortError(error)) throw error;
    const limit = error instanceof EngineError && error.code === "resource-limit";
    throw new AgentError(limit ? "resource-limit" : "invalid-file", limit ? "The drawing exceeds the Visio page or output limits." : "This is not a valid or supported Visio drawing.", { pluginId: PLUGIN_ID, cause: error });
  }
}

const size = ({ width, height }: PageSummary) => (width && height ? `${width} × ${height} in` : "unknown size");

function pageTarget(target: string): number {
  const match = /^page:([1-9]\d*)$/.exec(target);
  if (!match) throw new AgentError("target-not-found", `Unknown Visio target: "${target}".`, { pluginId: PLUGIN_ID });
  return Number(match[1]) - 1;
}

const visioExtractor: StructuredExtractor = {
  async inspect(context): Promise<InspectPayload> {
    const { format, count, pages } = await openPages(context);
    return {
      metadata: {
        format,
        pages: count,
        pageSizes: [...new Set(pages.map(size))],
        groups: pages.reduce((sum, page) => sum + page.groups, 0),
        drawingElements: pages.reduce((sum, page) => sum + page.elements, 0),
        textBlocks: pages.reduce((sum, page) => sum + page.texts.length, 0),
      },
      targets: pages.map((page) => ({ id: `page:${page.index + 1}`, title: `Page ${page.index + 1} (${size(page)})`, kind: "page", size: page.texts.length })),
    };
  },

  async read(context, params): Promise<ReadResult> {
    const { pages } = await openPages(context, params.target === undefined ? undefined : pageTarget(params.target));
    const needle = params.filter?.trim().toLowerCase();
    const lines = pages.flatMap((page) => {
      const texts = needle ? page.texts.filter((text) => text.toLowerCase().includes(needle)) : page.texts;
      return [
        ...(page.index > 0 && pages.length > 1 ? [""] : []),
        `## Page ${page.index + 1}`,
        `${size(page)} · ${page.groups} groups · ${page.elements} drawing elements · ${page.texts.length} text blocks`,
        "",
        ...(texts.length ? texts.map((text) => `- ${text}`) : [needle ? "(no matching text)" : "(no text)"]),
      ];
    });
    const result = paginateLines(lines, params.cursor, params.maxBytes, PLUGIN_ID);
    return { ...result, contentType: "markdown", ...(needle ? { filterApplied: true } : {}) };
  },
};

export default visioExtractor;
