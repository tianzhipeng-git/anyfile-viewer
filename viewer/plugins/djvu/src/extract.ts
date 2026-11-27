import { importRuntime } from "@anyfile/runtime-assets";
import {
  AgentError,
  abortError,
  isViewerAbortError,
  markdownDocumentHeader,
  readPagedTextDocument,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";
import { createDjvuEngine, DjvuEngineError, type DjvuEmscriptenModule, type DjvuEngine } from "./engine";
import { DJVU_LIMITS } from "./limits";
import { DJVU_ARTIFACT_VERSION } from "./runtime";
import type { DjvuOpenResult, DjvuOutlineItem, DjvuTextWord } from "./types";

const PLUGIN_ID = "djvu-reader";
/** Same djvulibre build the Web viewer loads from `/vendor/`. */
const VENDOR_DIR = `djvulibre/${DJVU_ARTIFACT_VERSION}/`;
const MAX_OUTLINE_TITLES = 200;
const MAX_TEXT_SAMPLED_PAGES = 200;

let runtime: Promise<DjvuEngine> | undefined;

/** One djvulibre instance per worker; the engine holds one open document at a time. */
function loadEngine(context: ExtractContext): Promise<DjvuEngine> {
  runtime ??= (async () => {
    const { default: create } = await importRuntime<{ default(options: Record<string, unknown>): Promise<DjvuEmscriptenModule> }>(
      await context.vendor.url(`${VENDOR_DIR}djvu.js`),
    );
    return createDjvuEngine(await create({
      wasmBinary: await context.vendor.bytes(`${VENDOR_DIR}djvu.wasm`),
      print: () => {},
      printErr: () => {},
    }));
  })().catch((error: unknown) => {
    runtime = undefined;
    throw new AgentError("runtime-unavailable", `djvulibre runtime failed to load: ${error instanceof Error ? error.message : String(error)}`, { pluginId: PLUGIN_ID, cause: error });
  });
  return runtime;
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof DjvuEngineError && (error.code === "resource-limit" || error.code === "missing-related-file")) {
    throw new AgentError(error.code, error.message, { pluginId: PLUGIN_ID, cause: error });
  }
  if (error instanceof RangeError) {
    throw new AgentError("resource-limit", "The DjVu document exceeds WASM memory limits.", { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable DjVu document.", { pluginId: PLUGIN_ID, cause: error });
}

/** djvulibre parses from its in-memory FS, so the whole file is read under the 128 MiB viewer cap. */
async function withDocument<T>(context: ExtractContext, run: (engine: DjvuEngine, doc: DjvuOpenResult) => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  if (context.source.size > DJVU_LIMITS.maxInputBytes) {
    throw new AgentError("resource-limit", "The DjVu file exceeds the 128 MiB safety limit.", { pluginId: PLUGIN_ID });
  }
  const bytes = await context.source.read(0, context.source.size, context.signal);
  const engine = await loadEngine(context);
  if (context.signal.aborted) throw abortError();
  try {
    return await run(engine, engine.open(bytes));
  } catch (error) {
    return mapError(error);
  } finally {
    engine.close();
  }
}

/** Groups hidden-text words into lines (top to bottom, overlapping vertical centres), each read left to right. */
function readingOrder(words: readonly DjvuTextWord[]) {
  const sorted = [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines: DjvuTextWord[][] = [];
  for (const word of sorted) {
    const line = lines.at(-1);
    const head = line?.[0];
    if (line && head && Math.abs(word.y + word.h / 2 - (head.y + head.h / 2)) < Math.min(word.h, head.h) / 2) line.push(word);
    else lines.push([word]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x).map((word) => word.t.trim()).join(" "));
}

function pageMarkdown(engine: DjvuEngine, index: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const lines = readingOrder(engine.text(index)?.words ?? []);
  return [`## Page ${index + 1}`, "", ...(lines.length ? lines : ["(no hidden text layer on this page)"])].join("\n");
}

function outlineTitles(items: readonly DjvuOutlineItem[]) {
  const titles: string[] = [];
  const walk = (nodes: readonly DjvuOutlineItem[], depth: number) => {
    for (const node of nodes) {
      if (titles.length >= MAX_OUTLINE_TITLES) return;
      titles.push(`${"  ".repeat(depth)}${node.title}${node.page >= 0 ? ` (page ${node.page + 1})` : ""}`);
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(items, 0);
  return titles;
}

const djvuExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return withDocument(context, async (engine, doc) => {
      const pageSizes = [...new Set(doc.pages.map((page) => `${page.width} x ${page.height} px @ ${page.dpi} dpi`))];
      const sampledPages = Math.min(doc.pageCount, MAX_TEXT_SAMPLED_PAGES);
      let sampledPagesWithText = 0;
      for (let index = 0; index < sampledPages; index += 1) {
        if (context.signal.aborted) throw abortError();
        if (engine.text(index)) sampledPagesWithText += 1;
      }
      return {
        metadata: {
          documentType: doc.docType,
          pageCount: doc.pageCount,
          pageSizes: pageSizes.slice(0, 20),
          // Hidden-text presence is sampled from the first pages only.
          sampledPages,
          sampledPagesWithText,
          outline: outlineTitles(doc.outline),
          sizeBytes: context.source.size,
        },
        targets: doc.pages.map((page, index) => ({ id: `page:${index + 1}`, title: `Page ${index + 1} (${page.width} x ${page.height} px)`, kind: "page" })),
      };
    });
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return withDocument(context, async (engine, doc) => readPagedTextDocument({
      pageCount: doc.pageCount,
      header: () => markdownDocumentHeader(context.file.name, { Pages: String(doc.pageCount), Structure: doc.docType }),
      page: async (index) => pageMarkdown(engine, index, context.signal),
    }, params, PLUGIN_ID));
  },
};

export default djvuExtractor;
