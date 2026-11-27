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

import { loadOfdDocument, type OfdDocument } from "./document";
import { OFD_LIMITS } from "./limits";
import { loadOfdPage } from "./model";
import { OfdLimitError, OfdPackage } from "./package";
import { extractPageText } from "./text";

const PLUGIN_ID = "ofd-reader";
const PAGE_TARGET = /^page:([1-9]\d*)$/;
const encoder = new TextEncoder();

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof OfdLimitError) {
    throw new AgentError("resource-limit", "The OFD document exceeds safety limits.", { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable OFD document.", { pluginId: PLUGIN_ID, cause: error });
}

async function withDocument<T>(context: ExtractContext, run: (doc: OfdDocument) => Promise<T>): Promise<T> {
  if (context.signal.aborted) throw abortError();
  if (context.file.size > OFD_LIMITS.maxInputBytes) {
    throw new AgentError("resource-limit", "The OFD document exceeds safety limits.", { pluginId: PLUGIN_ID });
  }
  let pkg: OfdPackage | undefined;
  try {
    pkg = await OfdPackage.open(context.file, context.signal);
    return await run(await loadOfdDocument(pkg));
  } catch (error) {
    return mapError(error);
  } finally {
    await pkg?.close();
  }
}

function stampCount(doc: OfdDocument, index: number) {
  return doc.stamps.get(doc.pages[index]!.id)?.length ?? 0;
}

/** Groups text runs into lines (top to bottom, overlapping vertical centres), each read left to right. */
function readingOrder(words: readonly PagedTextWord[]) {
  const sorted = [...words].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines: PagedTextWord[][] = [];
  for (const word of sorted) {
    const line = lines.at(-1);
    const head = line?.[0];
    if (line && head && Math.abs(word.y + word.h / 2 - (head.y + head.h / 2)) < Math.min(word.h, head.h) / 2) line.push(word);
    else lines.push([word]);
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x).map((word) => word.text.trim()).join(" "));
}

async function pageMarkdown(doc: OfdDocument, index: number, signal: AbortSignal) {
  if (signal.aborted) throw abortError();
  const lines = readingOrder(extractPageText(await loadOfdPage(doc, index))?.words ?? []);
  const stamps = stampCount(doc, index);
  return [
    `## Page ${index + 1}`,
    "",
    ...(lines.length ? lines : ["(no text on this page)"]),
    ...(stamps ? ["", `(${stamps} electronic seal stamp${stamps === 1 ? "" : "s"} on this page)`] : []),
  ].join("\n");
}

function documentHeader(doc: OfdDocument, fileName: string) {
  const fields = Object.entries(doc.info).filter(([name]) => name !== "Title");
  return [`# ${doc.info.Title ?? fileName}`, "", ...fields.map(([name, value]) => `- **${name}**: ${value.replace(/\s+/g, " ")}`)]
    .join("\n")
    .trim();
}

/**
 * Whole-document text: pages are parsed only until the requested window is covered, so an
 * unfiltered read never parses pages past `offset + maxBytes`.
 */
async function documentText(doc: OfdDocument, fileName: string, needBytes: number, signal: AbortSignal) {
  const parts = [documentHeader(doc, fileName)];
  let bytes = encoder.encode(parts[0]).byteLength;
  for (let index = 0; index < doc.pages.length && bytes <= needBytes; index += 1) {
    const page = await pageMarkdown(doc, index, signal);
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

const ofdExtractor: StructuredExtractor = {
  inspect(context: ExtractContext): Promise<InspectPayload> {
    return withDocument(context, async (doc) => {
      const stamps = [...doc.stamps.values()].reduce((sum, list) => sum + list.length, 0);
      return {
        metadata: {
          documentInfo: doc.info,
          pageCount: doc.pages.length,
          pageAreaMm: `${doc.pageArea.width} x ${doc.pageArea.height}`,
          signatureCount: doc.signatureCount,
          sealStampCount: stamps,
          outlineEntries: doc.outline.length,
          sizeBytes: context.source.size,
        },
        targets: doc.pages.map((_, index) => {
          const count = stampCount(doc, index);
          return { id: `page:${index + 1}`, title: count ? `Page ${index + 1} (${count} seal${count === 1 ? "" : "s"})` : `Page ${index + 1}`, kind: "page" };
        }),
      };
    });
  },

  read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    return withDocument(context, async (doc) => {
      const maxBytes = Math.min(params.maxBytes, HARD_READ_MAX_BYTES);
      if (params.target === undefined) {
        const filtered = Boolean(params.filter?.trim());
        const need = filtered ? Infinity : parsePositionCursor(params.cursor, "offset:", PLUGIN_ID) + maxBytes;
        return pageText(await documentText(doc, context.file.name, need, context.signal), params, maxBytes);
      }
      const index = Number(PAGE_TARGET.exec(params.target)?.[1] ?? 0) - 1;
      if (index < 0 || index >= doc.pages.length) {
        throw new AgentError("target-not-found", `OFD target not found: "${params.target}".`, { pluginId: PLUGIN_ID });
      }
      return pageText(await pageMarkdown(doc, index, context.signal), params, maxBytes);
    });
  },
};

export default ofdExtractor;
