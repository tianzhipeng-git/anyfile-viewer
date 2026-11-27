import {
  AgentError,
  ViewerError,
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
import { openBookZip, ProtectedBookError, type BookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import { markupToMarkdown } from "@anyfile/rendering-publication/text";

import { EPUB_LIMITS, elements, parsePublication, parseXml, type EpubPublication } from "./publication";

const PLUGIN_ID = "epub-reader";

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ProtectedBookError) {
    if (/fixed-layout/i.test(error.message)) {
      throw new AgentError("unsupported-capability", "Fixed-layout EPUB is not supported.", { pluginId: PLUGIN_ID, cause: error });
    }
    throw new AgentError("encrypted-file", "DRM-protected or obfuscated EPUB is not supported.", { pluginId: PLUGIN_ID, cause: error });
  }
  if (error instanceof ViewerError && (error.code === "resource-limit" || error.code === "missing-related-file")) {
    throw new AgentError(error.code, `EPUB: ${error.message}`, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable EPUB book.", { pluginId: PLUGIN_ID, cause: error });
}

async function withBook<T>(context: ExtractContext, run: (zip: BookZip, book: EpubPublication) => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  let zip: BookZip | undefined;
  try {
    zip = await openBookZip(context.file, context.signal);
    return await run(zip, await parsePublication(zip, context.signal));
  } catch (error) {
    return mapError(error);
  } finally {
    await zip?.dispose();
  }
}

/** Chapter titles from the TOC entry pointing at the start of each spine document. */
function chapterTitles(book: EpubPublication): string[] {
  return book.spine.map((item, index) => {
    const entries = book.toc.filter((entry) => entry.path === item.path);
    return (entries.find((entry) => !entry.fragment) ?? entries[0])?.label || `Chapter ${index + 1}`;
  });
}

async function chapterMarkdown(zip: BookZip, book: EpubPublication, titles: readonly string[], index: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const doc = parseXml(await zip.read(book.spine[index]!.path, EPUB_LIMITS.chapter, signal));
  const body = elements(doc, "body")[0] ?? doc.documentElement;
  const text = markupToMarkdown(body, { headingOffset: 2 });
  return [`## Chapter ${index + 1}: ${titles[index]}`, "", text || "(no text in this chapter)"].join("\n");
}

const first = (book: EpubPublication, name: string) => book.metadata[name]?.[0];

const epubExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return withBook(context, async (_zip, book) => {
      const titles = chapterTitles(book);
      return {
        metadata: {
          title: book.title.trim(),
          authors: book.metadata.creator ?? [],
          language: first(book, "language") ?? null,
          publisher: first(book, "publisher") ?? null,
          identifiers: book.metadata.identifier ?? [],
          packageMetadata: book.metadata,
          direction: book.direction,
          chapterCount: book.spine.length,
          toc: book.toc.map((entry) => ({ label: entry.label, path: entry.path, ...(entry.fragment ? { fragment: entry.fragment } : {}) })),
          sizeBytes: context.source.size,
        },
        targets: titles.map((title, index) => ({ id: `chapter:${index + 1}`, title, kind: "chapter" })),
      };
    });
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return withBook(context, async (zip, book) => {
      const titles = chapterTitles(book);
      const fields: Record<string, string> = {};
      for (const [label, name] of [["Authors", "creator"], ["Language", "language"], ["Publisher", "publisher"], ["Date", "date"], ["Identifier", "identifier"], ["Description", "description"]] as const) {
        const values = book.metadata[name];
        if (values?.length) fields[label] = values.join("; ");
      }
      fields.Chapters = String(book.spine.length);
      return readPagedTextDocument({
        pageCount: book.spine.length,
        targetPrefix: "chapter",
        header: () => markdownDocumentHeader(book.title.trim() || context.file.name, fields),
        page: (index) => chapterMarkdown(zip, book, titles, index, context.signal),
      }, params, PLUGIN_ID);
    });
  },
};

export default epubExtractor;
