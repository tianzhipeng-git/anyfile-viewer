import {
  AgentError,
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
import {
  getDocument,
  PDFDataRangeTransport,
  VerbosityLevel,
  version,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";

import { probePdf } from "./probe";

const PLUGIN_ID = "pdfjs-pdf";
/** pdf.js reads the file in ranges, so the cap only bounds parser bookkeeping, not memory per read. */
const MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_OUTLINE_TITLES = 200;
const MAX_PAGE_SIZES = 20;
const INFO_FIELDS = ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"] as const;

/** pdf.js runs its "worker" on this thread (fake worker) when the worker module is preloaded globally. */
async function ensureMainThreadWorker() {
  const scope = globalThis as { pdfjsWorker?: unknown };
  scope.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
}

/** CMaps and standard fonts come from the same `/vendor/pdfjs/<version>/` set the Web viewer serves. */
function vendorDataFactory(context: ExtractContext) {
  return class VendorBinaryDataFactory {
    readonly urls: Record<string, string | null>;
    constructor(urls: { cMapUrl?: string | null; standardFontDataUrl?: string | null; wasmUrl?: string | null }) {
      this.urls = { cMapUrl: urls.cMapUrl ?? null, standardFontDataUrl: urls.standardFontDataUrl ?? null, wasmUrl: urls.wasmUrl ?? null };
    }
    async fetch({ kind, filename }: { kind: string; filename: string }) {
      const base = this.urls[kind];
      if (!base) throw new Error(`No vendor directory for ${kind}.`);
      return context.vendor.bytes(`${base}${filename}`);
    }
  };
}

/** Feeds pdf.js range requests from `BinarySource` instead of loading the whole file. */
class SourceRangeTransport extends PDFDataRangeTransport {
  constructor(private readonly context: ExtractContext, private readonly onError: (error: unknown) => void) {
    super(context.source.size, null);
  }
  override requestDataRange(begin: number, end: number) {
    this.context.source.read(begin, end - begin, this.context.signal)
      .then((chunk) => this.onDataRange(begin, chunk))
      .catch(this.onError);
  }
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof Error && error.name === "PasswordException") {
    throw new AgentError("encrypted-file", "The PDF is password protected.", { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable PDF document.", { pluginId: PLUGIN_ID, cause: error });
}

async function withDocument<T>(context: ExtractContext, run: (doc: PDFDocumentProxy) => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  if (context.source.size > MAX_INPUT_BYTES) {
    throw new AgentError("resource-limit", "The PDF exceeds the 2 GiB safety limit.", { pluginId: PLUGIN_ID });
  }
  if (await probePdf({ file: context.file, signal: context.signal }) === 0) {
    throw new AgentError("invalid-file", "The file is not a PDF document.", { pluginId: PLUGIN_ID });
  }
  await ensureMainThreadWorker();
  let rejectRead!: (error: unknown) => void;
  const readFailed = new Promise<never>((_, reject) => { rejectRead = reject; });
  readFailed.catch(() => undefined);
  const vendorBase = `pdfjs/${version}/`;
  const task = getDocument({
    range: new SourceRangeTransport(context, rejectRead),
    disableAutoFetch: true,
    disableStream: true,
    disableFontFace: true,
    useSystemFonts: false,
    useWorkerFetch: false,
    isEvalSupported: false,
    verbosity: VerbosityLevel.ERRORS,
    cMapUrl: `${vendorBase}cmaps/`,
    standardFontDataUrl: `${vendorBase}standard_fonts/`,
    wasmUrl: `${vendorBase}wasm/`,
    BinaryDataFactory: vendorDataFactory(context),
  } as Parameters<typeof getDocument>[0]);
  // A password prompt cannot be answered here: fail fast instead of waiting forever.
  task.onPassword = () => rejectRead(Object.assign(new Error("Password required."), { name: "PasswordException" }));
  const onAbort = () => rejectRead(abortError());
  context.signal.addEventListener("abort", onAbort, { once: true });
  try {
    const doc = await Promise.race([task.promise, readFailed]);
    return await Promise.race([run(doc), readFailed]);
  } catch (error) {
    if (context.signal.aborted) throw abortError();
    return mapError(error);
  } finally {
    context.signal.removeEventListener("abort", onAbort);
    await task.destroy();
  }
}

interface TextRun { readonly str: string; readonly transform: readonly number[]; readonly height: number; readonly hasEOL?: boolean }

/** Joins text runs into lines: runs on the same baseline (within half a line height) read left to right. */
function textLines(items: readonly TextRun[]) {
  const lines: { y: number; h: number; runs: { x: number; text: string }[] }[] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const x = item.transform[4] ?? 0;
    const y = item.transform[5] ?? 0;
    const h = Math.max(1, item.height || Math.abs(item.transform[3] ?? 0));
    const line = lines.find((candidate) => Math.abs(candidate.y - y) < Math.min(candidate.h, h) / 2);
    if (line) line.runs.push({ x, text: item.str });
    else lines.push({ y, h, runs: [{ x, text: item.str }] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.runs.sort((a, b) => a.x - b.x).map((run) => run.text.trim()).join(" "));
}

async function pageMarkdown(doc: PDFDocumentProxy, index: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const page = await doc.getPage(index + 1);
  try {
    const content = await page.getTextContent();
    const lines = textLines(content.items.filter((item) => "str" in item));
    return [`## Page ${index + 1}`, "", ...(lines.length ? lines : ["(no text on this page)"])].join("\n");
  } finally {
    page.cleanup();
  }
}

async function documentInfo(doc: PDFDocumentProxy) {
  return (await doc.getMetadata()).info as unknown as Record<string, unknown>;
}

function infoFields(info: Record<string, unknown>) {
  const fields: Record<string, string> = {};
  for (const name of INFO_FIELDS) {
    const value = info[name];
    if (typeof value === "string" && value.trim()) fields[name] = value.trim();
  }
  return fields;
}

async function outlineTitles(doc: PDFDocumentProxy) {
  const titles: string[] = [];
  const walk = (nodes: readonly { title?: string; items?: readonly unknown[] }[], depth: number) => {
    for (const node of nodes) {
      if (titles.length >= MAX_OUTLINE_TITLES) return;
      titles.push(`${"  ".repeat(depth)}${node.title ?? ""}`);
      if (node.items?.length) walk(node.items as typeof nodes, depth + 1);
    }
  };
  walk((await doc.getOutline().catch(() => null)) ?? [], 0);
  return titles;
}

const pdfExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return withDocument(context, async (doc) => {
      const info = await documentInfo(doc);
      const sizes: string[] = [];
      const pagesWithText: number[] = [];
      for (let index = 0; index < Math.min(doc.numPages, MAX_PAGE_SIZES); index += 1) {
        if (context.signal.aborted) throw abortError();
        const page = await doc.getPage(index + 1);
        const { width, height } = page.getViewport({ scale: 1 });
        sizes.push(`${Math.round(width)} x ${Math.round(height)} pt`);
        const content = await page.getTextContent();
        if (content.items.some((item) => "str" in item && item.str.trim())) pagesWithText.push(index + 1);
        page.cleanup();
      }
      const outline = await outlineTitles(doc);
      const metadata: Record<string, JsonValue> = {
        pageCount: doc.numPages,
        pdfVersion: typeof info.PDFFormatVersion === "string" ? info.PDFFormatVersion : null,
        encrypted: typeof info.EncryptFilterName === "string",
        documentInfo: infoFields(info),
        pageSizes: [...new Set(sizes)],
        // Page sizes and text presence are sampled from the first pages only.
        sampledPages: sizes.length,
        sampledPagesWithText: pagesWithText.length,
        outline,
        sizeBytes: context.source.size,
      };
      return {
        metadata,
        targets: Array.from({ length: doc.numPages }, (_, index) => ({ id: `page:${index + 1}`, title: `Page ${index + 1}`, kind: "page" })),
      };
    });
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return withDocument(context, async (doc) => {
      const info = await documentInfo(doc);
      const { Title, ...fields } = infoFields(info);
      return readPagedTextDocument({
        pageCount: doc.numPages,
        header: () => markdownDocumentHeader(Title ?? context.file.name, fields),
        page: (index) => pageMarkdown(doc, index, context.signal),
      }, params, PLUGIN_ID);
    });
  },
};

export default pdfExtractor;
