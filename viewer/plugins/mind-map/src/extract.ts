import { readBookZipCatalog } from "@anyfile/archive-metadata-viewer/zip-catalog";
import { ProtectedBookError } from "@anyfile/archive-metadata-viewer/book-source";
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

import { readMindMap, type Sheet, type Topic } from "./parse";

const PLUGIN_ID = "mind-map";
const KIND_LABELS: Record<string, string> = { detached: "floating", summary: "summary", callout: "callout" };

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ProtectedBookError) {
    throw new AgentError("encrypted-file", "The mind map archive is encrypted.", { pluginId: PLUGIN_ID, cause: error });
  }
  if (error instanceof ViewerError && error.code === "resource-limit") {
    throw new AgentError("resource-limit", "The mind map exceeds safety limits.", { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable mind map.", { pluginId: PLUGIN_ID, cause: error });
}

async function formatName(file: File, signal: AbortSignal) {
  if (/\.mm$/i.test(file.name)) return "FreeMind / Freeplane";
  if (/\.mmap$/i.test(file.name)) return "MindManager";
  const { names } = await readBookZipCatalog(file, signal);
  return names.has("content.json") ? "XMind" : "XMind (legacy XML)";
}

async function loadSheets(context: ExtractContext): Promise<{ readonly format: string; readonly sheets: Sheet[] }> {
  if (context.signal.aborted) throw abortError();
  try {
    const sheets = await readMindMap(context.file, context.signal, undefined, { assets: false });
    return { format: await formatName(context.file, context.signal), sheets };
  } catch (error) {
    return mapError(error);
  }
}

function countTopics(topic: Topic): number {
  let count = 0;
  const stack = [topic];
  while (stack.length) {
    const next = stack.pop()!;
    count += 1;
    stack.push(...next.children);
  }
  return count;
}

const oneLine = (value: string) => value.replace(/\s+/g, " ").trim();
const sheetTitle = (sheet: Sheet, index: number) => oneLine(sheet.title) || oneLine(sheet.root.title) || `Sheet ${index + 1}`;

/** Indented Markdown outline; notes are quoted under their topic. Iterative: maps may be 128 levels deep. */
export function sheetOutline(sheet: Sheet, index: number): string {
  const lines = [`## Sheet ${index + 1}: ${sheetTitle(sheet, index)}`, ""];
  const titles = new Map<string, string>();
  const stack: { topic: Topic; depth: number }[] = [{ topic: sheet.root, depth: 0 }];
  while (stack.length) {
    const { topic, depth } = stack.pop()!;
    const title = oneLine(topic.title) || "(untitled)";
    titles.set(topic.id, title);
    const indent = "  ".repeat(depth);
    const extras = [
      KIND_LABELS[topic.kind] ? `(${KIND_LABELS[topic.kind]})` : "",
      topic.labels.length ? `[labels: ${topic.labels.join(", ")}]` : "",
      topic.markers.length ? `[markers: ${topic.markers.join(", ")}]` : "",
      topic.link ? `<${topic.link}>` : "",
      topic.attachments.length ? `[attachments: ${topic.attachments.map((item) => item.name || item.path).join(", ")}]` : "",
    ].filter(Boolean);
    lines.push(`${indent}- ${[title, ...extras].join(" ")}`);
    for (const note of topic.notes.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)) {
      lines.push(`${indent}  > ${note}`);
    }
    for (let child = topic.children.length - 1; child >= 0; child -= 1) {
      stack.push({ topic: topic.children[child]!, depth: depth + 1 });
    }
  }
  const relationships = [...(sheet.relationships ?? [])];
  const visit = [sheet.root];
  while (visit.length) {
    const topic = visit.pop()!;
    relationships.push(...topic.relationships);
    visit.push(...topic.children);
  }
  if (relationships.length) {
    lines.push("", "Relationships:");
    for (const link of relationships) {
      const label = oneLine(link.title);
      lines.push(`- ${titles.get(link.from) ?? link.from} → ${titles.get(link.to) ?? link.to}${label ? `: ${label}` : ""}`);
    }
  }
  return lines.join("\n");
}

const mindMapExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const { format, sheets } = await loadSheets(context);
    const counts = sheets.map((sheet) => countTopics(sheet.root));
    return {
      metadata: {
        format,
        sizeBytes: context.source.size,
        sheetCount: sheets.length,
        topicCount: counts.reduce((sum, count) => sum + count, 0),
        sheets: sheets.map((sheet, index) => ({
          title: sheetTitle(sheet, index),
          rootTopic: oneLine(sheet.root.title),
          topics: counts[index]!,
        })),
      },
      targets: sheets.map((sheet, index) => ({
        id: `sheet:${index + 1}`,
        title: sheetTitle(sheet, index),
        kind: "sheet",
        size: counts[index]!,
      })),
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const { format, sheets } = await loadSheets(context);
    return readPagedTextDocument({
      pageCount: sheets.length,
      targetPrefix: "sheet",
      header: () => markdownDocumentHeader(context.file.name, { Format: format, Sheets: String(sheets.length) }),
      page: async (index) => sheetOutline(sheets[index]!, index),
    }, params, PLUGIN_ID);
  },
};

export default mindMapExtractor;
