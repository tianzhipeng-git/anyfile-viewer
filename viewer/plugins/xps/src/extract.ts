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
import type { PagedTextWord } from "@anyfile/viewer-rendering/paged";

import { loadXpsDocument, loadXpsPage, loadXpsProperties, type XpsDocumentModel } from "./document";
import { XPS_LIMITS } from "./limits";
import { XpsLimitError, XpsPackage } from "./package";
import { extractPageText } from "./text";

const PLUGIN_ID = "xps-reader";

interface Loaded {
  readonly pkg: XpsPackage;
  readonly doc: XpsDocumentModel;
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof XpsLimitError) {
    throw new AgentError("resource-limit", "The XPS document exceeds safety limits.", { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable XPS document.", { pluginId: PLUGIN_ID, cause: error });
}

async function withDocument<T>(context: ExtractContext, run: (loaded: Loaded) => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  if (context.file.size > XPS_LIMITS.maxInputBytes) {
    throw new AgentError("resource-limit", "The XPS document exceeds safety limits.", { pluginId: PLUGIN_ID });
  }
  let pkg: XpsPackage | undefined;
  try {
    pkg = await XpsPackage.open(context.file, context.signal);
    return await run({ pkg, doc: await loadXpsDocument(pkg) });
  } catch (error) {
    return mapError(error);
  } finally {
    await pkg?.close();
  }
}

/** Glyphs runs in document order; consecutive runs on one baseline share a line. */
function textLines(words: readonly PagedTextWord[]) {
  const lines: string[] = [];
  let previous: PagedTextWord | undefined;
  for (const word of words) {
    const text = word.text.trim();
    const sameLine = previous && Math.abs(word.y + word.h / 2 - (previous.y + previous.h / 2)) < Math.min(word.h, previous.h) / 2;
    if (sameLine && lines.length) lines[lines.length - 1] += ` ${text}`;
    else lines.push(text);
    previous = word;
  }
  return lines;
}

async function pageMarkdown({ pkg, doc }: Loaded, index: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const lines = textLines(extractPageText(await loadXpsPage(pkg, doc.pages[index]!.part))?.words ?? []);
  return [`## Page ${index + 1}`, "", ...(lines.length ? lines : ["(no text on this page)"])].join("\n");
}

const xpsExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return withDocument(context, async ({ pkg, doc }) => ({
      metadata: {
        format: doc.openXps ? "OpenXPS" : "XPS",
        properties: await loadXpsProperties(pkg),
        fixedDocuments: doc.documents.length,
        pageCount: doc.pages.length,
        outlineEntries: doc.outline.length,
        sizeBytes: context.source.size,
      },
      targets: doc.pages.map((_, index) => ({ id: `page:${index + 1}`, title: `Page ${index + 1}`, kind: "page" })),
    }));
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return withDocument(context, async (loaded) => {
      return readPagedTextDocument({
        pageCount: loaded.doc.pages.length,
        header: async () => {
          const { title, ...fields } = await loadXpsProperties(loaded.pkg);
          return markdownDocumentHeader(title ?? context.file.name, fields);
        },
        page: (index) => pageMarkdown(loaded, index, context.signal),
      }, params, PLUGIN_ID);
    });
  },
};

export default xpsExtractor;
