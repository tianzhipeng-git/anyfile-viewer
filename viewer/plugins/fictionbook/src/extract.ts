import {
  AgentError,
  ViewerError,
  abortError,
  isViewerAbortError,
  markdownDocumentHeader,
  readPagedTextDocument,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";
import { openBookZip, ProtectedBookError, type BookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import { markupToMarkdown } from "@anyfile/rendering-publication/text";

import { singleFb2 } from "./encoding";
import { children, FB2_LIMITS, parseFictionBook, type Fb2Book } from "./publication";

const PLUGIN_ID = "fictionbook-reader";
/** FB2 elements as HTML for the shared text conversion; headings shift under `## Chapter n`. */
const FB2_TAGS: Record<string, string> = {
  title: "h1", subtitle: "h2", poem: "blockquote", cite: "blockquote", epigraph: "blockquote", annotation: "div",
  stanza: "div", v: "p", "text-author": "p", date: "p", "empty-line": "br", coverpage: "div", image: "img",
};

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ProtectedBookError) {
    throw new AgentError("encrypted-file", "Encrypted FictionBook archives are not supported.", { pluginId: PLUGIN_ID, cause: error });
  }
  if (error instanceof ViewerError && error.code === "resource-limit") {
    throw new AgentError("resource-limit", `FictionBook: ${error.message}`, { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable FictionBook document.", { pluginId: PLUGIN_ID, cause: error });
}

async function withBook<T>(context: ExtractContext, run: (book: Fb2Book) => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  let zip: BookZip | undefined;
  try {
    let bytes: Uint8Array;
    if (/\.zip$/i.test(context.file.name)) {
      zip = await openBookZip(context.file, context.signal);
      const path = singleFb2(zip.entries.keys());
      if (!path) throw new ViewerError("invalid-file", "The ZIP archive does not contain exactly one FB2 book.");
      bytes = await zip.read(path, FB2_LIMITS.file, context.signal);
    } else {
      if (context.file.size > FB2_LIMITS.file) throw new ViewerError("resource-limit", "FB2 file limit exceeded.");
      bytes = new Uint8Array(await context.file.arrayBuffer());
    }
    return await run(parseFictionBook(bytes, context.signal));
  } catch (error) {
    return mapError(error);
  } finally {
    await zip?.dispose();
  }
}

const clean = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";

function personName(person: Element) {
  const parts = ["first-name", "middle-name", "last-name"].map((name) => clean(children(person, name)[0]?.textContent));
  const name = parts.filter(Boolean).join(" ");
  const nickname = clean(children(person, "nickname")[0]?.textContent);
  return name || nickname;
}

const REPEATED = new Set(["author", "translator", "genre", "sequence"]);

/** One `description` block (title-info, publish-info...) as JSON metadata; repeatable fields become plural arrays. */
function infoBlock(info: Element | undefined): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const node of info ? Array.from(info.children) : []) {
    const name = node.localName;
    if (name === "coverpage" || name === "image") continue;
    const value = name === "author" || name === "translator" ? personName(node)
      : name === "sequence" ? [node.getAttribute("name"), node.getAttribute("number")].filter(Boolean).join(" #")
      : name === "annotation" || name === "history" ? markupToMarkdown(node, { tagMap: FB2_TAGS })
      : clean(node.textContent);
    if (!value) continue;
    if (REPEATED.has(name)) ((result[`${name}s`] ??= []) as string[]).push(value);
    else result[name] ??= value;
  }
  return result;
}

function chapterMarkdown(book: Fb2Book, index: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const item = book.spine[index]!;
  const text = markupToMarkdown(book.sections.get(item.path) ?? [], { tagMap: FB2_TAGS, headingOffset: 2 });
  return Promise.resolve([`## Chapter ${index + 1}: ${clean(item.id)}`, "", text || "(no text in this chapter)"].join("\n"));
}

const fictionBookExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return withBook(context, async (book) => {
      const block = (name: string) => (book.description ? children(book.description, name)[0] : undefined);
      const titleInfo = infoBlock(block("title-info"));
      const publishInfo = infoBlock(block("publish-info"));
      return {
        metadata: {
          title: book.title,
          authors: titleInfo.authors ?? [],
          language: titleInfo.lang ?? null,
          publisher: publishInfo.publisher ?? null,
          isbn: publishInfo.isbn ?? null,
          titleInfo,
          publishInfo,
          documentInfo: infoBlock(block("document-info")),
          chapterCount: book.spine.length,
          binaryCount: book.binaries.size,
          toc: book.toc.map((entry) => ({ label: clean(entry.label), chapter: book.spine.findIndex((item) => item.path === entry.path) + 1 })),
          sizeBytes: context.source.size,
        },
        targets: book.spine.map((item, index) => ({ id: `chapter:${index + 1}`, title: clean(item.id) || `Chapter ${index + 1}`, kind: "chapter" })),
      };
    });
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return withBook(context, async (book) => {
      const titleInfo = book.description ? children(book.description, "title-info")[0] : undefined;
      const field = (name: string) => clean(titleInfo && children(titleInfo, name)[0]?.textContent);
      const fields: Record<string, string> = {};
      if (book.author) fields.Authors = book.author;
      if (field("lang")) fields.Language = field("lang");
      if (field("genre")) fields.Genre = field("genre");
      if (field("date")) fields.Date = field("date");
      fields.Chapters = String(book.spine.length);
      return readPagedTextDocument({
        pageCount: book.spine.length,
        targetPrefix: "chapter",
        header: () => markdownDocumentHeader(book.title || context.file.name, fields),
        page: (index) => chapterMarkdown(book, index, context.signal),
      }, params, PLUGIN_ID);
    });
  },
};

export default fictionBookExtractor;
