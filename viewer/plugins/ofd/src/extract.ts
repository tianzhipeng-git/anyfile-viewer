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

import { loadOfdDocument, type OfdDocument } from "./document";
import { OFD_LIMITS } from "./limits";
import { loadOfdPage } from "./model";
import { OfdLimitError, OfdPackage } from "./package";
import { extractPageText } from "./text";

const PLUGIN_ID = "ofd-reader";

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
      const { Title, ...fields } = doc.info;
      return readPagedTextDocument({
        pageCount: doc.pages.length,
        header: () => markdownDocumentHeader(Title ?? context.file.name, fields),
        page: (index) => pageMarkdown(doc, index, context.signal),
      }, params, PLUGIN_ID);
    });
  },
};

export default ofdExtractor;
