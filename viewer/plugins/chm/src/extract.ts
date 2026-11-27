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
import type { PublicationSource } from "@anyfile/rendering-publication";
import { markupToMarkdown, parseHtmlText } from "@anyfile/rendering-publication/text";

import { readChmMetadata, type ChmMetadata, type ChmTocNode } from "./chm-metadata";
import { decodeChmText } from "./encoding";
import { parseChmDirectory, type ChmDirectory } from "./itsf";
import { CHM_LIMITS } from "./limits";
import { chmKey, createChmPublication } from "./publication";
import { createChmSectionReader, type ChmSectionReader } from "./section-reader";

const PLUGIN_ID = "chm-reader";
const MAX_TOC_ENTRIES = 1000;

interface ChmBook {
  readonly directory: ChmDirectory;
  readonly reader: ChmSectionReader;
  readonly metadata: ChmMetadata;
  readonly publication: PublicationSource;
  readonly titles: readonly string[];
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ViewerError && (error.code === "resource-limit" || error.code === "missing-related-file")) {
    throw new AgentError(error.code, `CHM: ${error.message}`, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable CHM help file.", { pluginId: PLUGIN_ID, cause: error });
}

/** Topic titles from the contents tree, then `#TOPICS`, then the file name. */
function topicTitles(metadata: ChmMetadata, publication: PublicationSource): string[] {
  const byKey = new Map<string, string>();
  const walk = (nodes: readonly ChmTocNode[]) => {
    for (const node of nodes) {
      const key = chmKey(node.path);
      if (key && node.label && !byKey.has(key)) byKey.set(key, node.label);
      walk(node.children);
    }
  };
  walk(metadata.tocTree);
  for (const topic of metadata.systemTopics) {
    const key = chmKey(topic.url);
    if (topic.title && !byKey.has(key)) byKey.set(key, topic.title);
  }
  return publication.spine.map((item) => byKey.get(item.path) || item.path.split("/").pop() || item.path);
}

async function withBook<T>(context: ExtractContext, run: (book: ChmBook) => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  if (context.file.size > CHM_LIMITS.maxFileBytes) {
    throw new AgentError("resource-limit", "The CHM file exceeds safety limits.", { pluginId: PLUGIN_ID });
  }
  let reader: ChmSectionReader | undefined;
  try {
    const directory = await parseChmDirectory(context.file, context.signal);
    reader = createChmSectionReader(context.file, directory);
    const metadata = await readChmMetadata(directory, reader, context.signal);
    const publication = createChmPublication(context.file.name, directory, metadata, reader, "en");
    return await run({ directory, reader, metadata, publication, titles: topicTitles(metadata, publication) });
  } catch (error) {
    return mapError(error);
  } finally {
    reader?.dispose();
  }
}

async function topicMarkdown(book: ChmBook, index: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const key = book.publication.spine[index]!.path;
  const entry = book.directory.byExactPath.get(`/${key}`);
  if (!entry) throw new AgentError("missing-related-file", `CHM topic is missing: ${key}`, { pluginId: PLUGIN_ID });
  const html = decodeChmText(await book.reader.readEntry(entry, CHM_LIMITS.maxTopicBytes, signal), book.metadata.encoding, true);
  const text = markupToMarkdown(parseHtmlText(html).body, { headingOffset: 2 });
  return [`## Topic ${index + 1}: ${book.titles[index]}`, "", text || "(no text in this topic)"].join("\n");
}

const chmExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return withBook(context, async ({ directory, metadata, publication, titles }) => {
      const chapterOf = new Map(publication.spine.map((item, index) => [item.path, index + 1]));
      return {
        metadata: {
          title: publication.title,
          compiledName: metadata.compiledName || null,
          encoding: metadata.encoding,
          lcid: `0x${directory.lcid.toString(16).padStart(4, "0")}`,
          defaultTopic: metadata.defaultTopic || null,
          topicCount: publication.spine.length,
          indexEntryCount: metadata.indexEntries.length,
          toc: publication.toc.slice(0, MAX_TOC_ENTRIES).map((entry) => ({ label: entry.label, chapter: chapterOf.get(entry.path) ?? null })),
          ...(publication.toc.length > MAX_TOC_ENTRIES ? { tocTruncated: true } : {}),
          sizeBytes: context.source.size,
        },
        targets: publication.spine.map((item, index) => ({ id: `chapter:${index + 1}`, title: `${titles[index]} (${item.path})`, kind: "topic" })),
      };
    });
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return withBook(context, async (book) => {
      const fields: Record<string, string> = {};
      if (book.metadata.compiledName) fields["Compiled name"] = book.metadata.compiledName;
      fields.Encoding = book.metadata.encoding;
      fields.Topics = String(book.publication.spine.length);
      return readPagedTextDocument({
        pageCount: book.publication.spine.length,
        targetPrefix: "chapter",
        header: () => markdownDocumentHeader(book.publication.title, fields),
        page: (index) => topicMarkdown(book, index, context.signal),
      }, params, PLUGIN_ID);
    });
  },
};

export default chmExtractor;
