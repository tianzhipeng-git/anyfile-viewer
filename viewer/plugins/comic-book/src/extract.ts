import { importRuntime } from "@anyfile/runtime-assets";
import { ProtectedBookError, type BookSource } from "@anyfile/archive-metadata-viewer/book-source";
import { openBookZip } from "@anyfile/archive-metadata-viewer/zip-source";
import {
  AgentError,
  HARD_READ_MAX_BYTES,
  ViewerError,
  abortError,
  escapeMarkdownCell,
  isViewerAbortError,
  markdownDocumentHeader,
  paginateLines,
  parsePositionCursor,
  readBlob,
  renderMarkdownTablePage,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";

import { COMIC_ARCHIVE_RUNTIME, COMPRESSED_COMIC_LIMIT, readCompressedArchive, type ArchiveModule } from "./compressed-archive";
import { parseComic, type ComicPage } from "./model";
import { comicArchiveKind } from "./signature";
import { openComicTar } from "./tar-source";

const PLUGIN_ID = "comic-book-reader";
const PAGE_COLUMNS = ["#", "Image", "Bytes", "Type", "Double page"];
const WORKER_CODES: Record<string, "encrypted-file" | "resource-limit" | "invalid-file"> = {
  protected: "encrypted-file",
  "resource-limit": "resource-limit",
  "invalid-file": "invalid-file",
  "missing-related-file": "invalid-file",
};

interface Comic {
  readonly format: string;
  readonly pages: readonly ComicPage[];
  readonly sizes: readonly number[];
  readonly rtl: boolean;
  readonly info: Readonly<Record<string, string>>;
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  const options = { pluginId: PLUGIN_ID, cause: error };
  if (error instanceof ProtectedBookError || (error instanceof Error && error.message === "protected")) {
    throw new AgentError("encrypted-file", "The comic archive is encrypted.", options);
  }
  const code = error instanceof ViewerError
    ? error.code === "resource-limit" ? "resource-limit" : error.code === "unsupported-environment" ? "runtime-unavailable" : "invalid-file"
    : error instanceof WebAssembly.RuntimeError ? "resource-limit" : error instanceof Error ? WORKER_CODES[error.message] ?? "invalid-file" : "invalid-file";
  const message = code === "resource-limit" ? "The comic archive exceeds safety limits."
    : code === "runtime-unavailable" ? "The comic archive decoder is unavailable." : "The file is not a readable comic archive.";
  throw new AgentError(code, message, options);
}

/** CBR/CB7 through the same libarchive WASM build the browser Worker loads, read from the local vendor cache. */
async function openCompressed(context: ExtractContext): Promise<BookSource> {
  if (context.file.size > COMPRESSED_COMIC_LIMIT) throw new ViewerError("resource-limit", "Compressed comic size limit.");
  const bytes = await readBlob(context.file, context.signal);
  if (!comicArchiveKind(bytes)) throw new ViewerError("invalid-file", "Not a RAR or 7z archive.");
  let mod: ArchiveModule;
  try {
    const { default: create } = await importRuntime<{ default(options: Record<string, unknown>): Promise<ArchiveModule> }>(
      await context.vendor.url(`${COMIC_ARCHIVE_RUNTIME}comic-archive.js`),
    );
    mod = await create({ wasmBinary: await context.vendor.bytes(`${COMIC_ARCHIVE_RUNTIME}comic-archive.wasm`), print: () => {}, printErr: () => {} });
  } catch (error) {
    throw new AgentError("runtime-unavailable", "The comic archive decoder (libarchive WASM) is not available locally.", { pluginId: PLUGIN_ID, cause: error });
  }
  const { entries, stored } = readCompressedArchive(bytes, mod);
  return {
    entries: new Map(entries.map((entry) => [entry.filename, entry])),
    async read(path, limit) {
      const data = stored.get(path);
      if (!data) throw new ViewerError("missing-related-file", "Missing comic resource.");
      if (data.byteLength > limit) throw new ViewerError("resource-limit", "Comic resource limit.");
      return data;
    },
    async dispose() { stored.clear(); },
  };
}

async function openArchive(context: ExtractContext): Promise<{ readonly format: string; readonly source: BookSource }> {
  const { file, signal } = context;
  if (/\.cbt$/i.test(file.name)) return { format: "CBT (TAR)", source: await openComicTar(file, signal) };
  const kind = comicArchiveKind(new Uint8Array(await file.slice(0, 8).arrayBuffer()));
  if (kind) return { format: kind === 7 ? "CB7 (7z)" : `CBR (RAR ${kind})`, source: await openCompressed(context) };
  return { format: "CBZ (ZIP)", source: await openBookZip(file, signal) };
}

async function loadComic(context: ExtractContext): Promise<Comic> {
  if (context.signal.aborted) throw abortError();
  let source: BookSource | undefined;
  try {
    const opened = await openArchive(context);
    source = opened.source;
    const { pages, rtl, info } = await parseComic(source, context.signal);
    const sizes = pages.map((page) => source!.entries.get(page.path)?.uncompressedSize ?? 0);
    return { format: opened.format, pages, sizes, rtl, info };
  } catch (error) {
    return mapError(error);
  } finally {
    await source?.dispose();
  }
}

function infoLines(comic: Comic, fileName: string): string[] {
  const { Title, Series, Number: issue } = comic.info;
  const title = Title || [Series, issue && `#${issue}`].filter(Boolean).join(" ") || fileName;
  return markdownDocumentHeader(title, {
    Format: comic.format,
    Pages: String(comic.pages.length),
    "Reading direction": comic.rtl ? "right-to-left" : "left-to-right",
    ...comic.info,
  }).split("\n");
}

const pageRow = (comic: Comic, index: number) => {
  const page = comic.pages[index]!;
  return [index + 1, page.path, comic.sizes[index]!, page.type, page.double ? "yes" : ""];
};

function matches(row: readonly unknown[], needle: string | undefined) {
  return !needle || row.some((cell) => String(cell).toLowerCase().includes(needle));
}

function readPages(comic: Comic, params: ReadParams, maxBytes: number, needle: string | undefined): ReadResult {
  const start = parsePositionCursor(params.cursor, "row:", PLUGIN_ID);
  if (start > comic.pages.length) throw new AgentError("target-not-found", `Cursor row ${start} is out of range.`, { pluginId: PLUGIN_ID });
  function* rows() {
    for (let index = start; index < comic.pages.length; index += 1) {
      const row = pageRow(comic, index);
      yield matches(row, needle) ? row : null;
    }
  }
  const page = renderMarkdownTablePage({ columns: PAGE_COLUMNS, rows: rows(), start, maxBytes, cursorPrefix: "row:" });
  return needle ? { ...page, filterApplied: true } : page;
}

const comicBookExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const comic = await loadComic(context);
    const imageTypes: Record<string, number> = {};
    for (const page of comic.pages) {
      const extension = page.path.split(".").pop()!.toLowerCase().replace("jpeg", "jpg");
      imageTypes[extension] = (imageTypes[extension] ?? 0) + 1;
    }
    const { Summary, ...info } = comic.info;
    return {
      metadata: {
        format: comic.format,
        sizeBytes: context.source.size,
        pageCount: comic.pages.length,
        imageBytes: comic.sizes.reduce((sum, size) => sum + size, 0),
        imageTypes,
        readingDirection: comic.rtl ? "right-to-left" : "left-to-right",
        hasComicInfo: Object.keys(comic.info).length > 0,
        comicInfo: { ...info, ...(Summary ? { Summary: Summary.length > 1000 ? `${Summary.slice(0, 1000)}…` : Summary } : {}) },
      },
      targets: [
        { id: "info", title: "Comic metadata (ComicInfo.xml)", kind: "metadata", size: Object.keys(comic.info).length },
        { id: "pages", title: "Page list", kind: "table", size: comic.pages.length },
      ],
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    if (params.target !== undefined && params.target !== "info" && params.target !== "pages") {
      throw new AgentError("target-not-found", `Comic target not found: "${params.target}".`, { pluginId: PLUGIN_ID });
    }
    const comic = await loadComic(context);
    const maxBytes = Math.min(params.maxBytes, HARD_READ_MAX_BYTES);
    const needle = params.filter?.trim().toLowerCase() || undefined;
    if (params.target === "pages") return readPages(comic, params, maxBytes, needle);
    let lines = infoLines(comic, context.file.name);
    if (params.target === undefined) {
      lines.push("", "## Pages", "", `| ${PAGE_COLUMNS.join(" | ")} |`, `| ${PAGE_COLUMNS.map(() => "---").join(" | ")} |`);
      for (let index = 0; index < comic.pages.length; index += 1) lines.push(`| ${pageRow(comic, index).map(escapeMarkdownCell).join(" | ")} |`);
    }
    if (needle) lines = lines.filter((line) => line.toLowerCase().includes(needle));
    return { contentType: "markdown", ...paginateLines(lines, params.cursor, maxBytes, PLUGIN_ID), ...(needle ? { filterApplied: true } : {}) };
  },
};

export default comicBookExtractor;
