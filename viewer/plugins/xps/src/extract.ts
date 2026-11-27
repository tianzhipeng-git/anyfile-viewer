import {
  AgentError,
  HARD_READ_MAX_BYTES,
  abortError,
  isViewerAbortError,
  paginateLines,
  paginateText,
  parsePositionCursor,
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
const PAGE_TARGET = /^page:([1-9]\d*)$/;
const encoder = new TextEncoder();

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

function documentHeader(properties: Readonly<Record<string, string>>, fileName: string) {
  const fields = Object.entries(properties).filter(([name]) => name !== "title");
  return [`# ${properties.title ?? fileName}`, "", ...fields.map(([name, value]) => `- **${name}**: ${value.replace(/\s+/g, " ")}`)]
    .join("\n")
    .trim();
}

/** Whole-document text; pages past `needBytes` are not parsed. */
async function documentText(loaded: Loaded, fileName: string, needBytes: number, signal: AbortSignal) {
  const parts = [documentHeader(await loadXpsProperties(loaded.pkg), fileName)];
  let bytes = encoder.encode(parts[0]).byteLength;
  for (let index = 0; index < loaded.doc.pages.length && bytes <= needBytes; index += 1) {
    const page = await pageMarkdown(loaded, index, signal);
    parts.push(page);
    bytes += encoder.encode(page).byteLength + 2;
  }
  return parts.join("\n\n");
}

function pageText(text: string, params: ReadParams, maxBytes: number): ReadResult {
  const needle = params.filter?.trim().toLowerCase();
  if (!needle) return paginateText(text, params.cursor, maxBytes, "markdown", PLUGIN_ID);
  const lines = text.split("\n").filter((line) => line.toLowerCase().includes(needle));
  return { contentType: "markdown", ...paginateLines(lines, params.cursor, maxBytes, PLUGIN_ID), filterApplied: true };
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
      const maxBytes = Math.min(params.maxBytes, HARD_READ_MAX_BYTES);
      if (params.target === undefined) {
        const filtered = Boolean(params.filter?.trim());
        const need = filtered ? Infinity : parsePositionCursor(params.cursor, "offset:", PLUGIN_ID) + maxBytes;
        return pageText(await documentText(loaded, context.file.name, need, context.signal), params, maxBytes);
      }
      const index = Number(PAGE_TARGET.exec(params.target)?.[1] ?? 0) - 1;
      if (index < 0 || index >= loaded.doc.pages.length) {
        throw new AgentError("target-not-found", `XPS target not found: "${params.target}".`, { pluginId: PLUGIN_ID });
      }
      return pageText(await pageMarkdown(loaded, index, context.signal), params, maxBytes);
    });
  },
};

export default xpsExtractor;
