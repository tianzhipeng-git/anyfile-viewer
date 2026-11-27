import {
  AgentError,
  ViewerError,
  abortError,
  isViewerAbortError,
  markdownDocumentHeader,
  readBlob,
  readPagedTextDocument,
  type ExtractContext,
  type InspectPayload,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";

import { MAX_FILE_BYTES, parseDesignDocument } from "./document";
import type { DesignDocument, DesignNode, DesignPage } from "./model";

const PLUGIN_ID = "design-source";
const FORMAT_NAMES = { figma: "Figma", sketch: "Sketch" } as const;

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof ViewerError && error.code === "resource-limit") {
    throw new AgentError("resource-limit", "The design file exceeds safety limits.", { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a readable Figma or Sketch document.", { pluginId: PLUGIN_ID, cause: error });
}

async function loadDocument(context: ExtractContext): Promise<DesignDocument> {
  if (context.signal.aborted) throw abortError();
  if (context.file.size > MAX_FILE_BYTES) {
    throw new AgentError("resource-limit", "The design file exceeds the 128 MiB safety limit.", { pluginId: PLUGIN_ID });
  }
  try {
    const doc = parseDesignDocument(await readBlob(context.file, context.signal), context.file.name);
    if (context.signal.aborted) throw abortError();
    if (doc.pages.length === 0 && !doc.thumbnail) throw new ViewerError("invalid-file", "Empty design document.");
    return doc;
  } catch (error) {
    return mapError(error);
  }
}

function countNodes(nodes: readonly DesignNode[]): number {
  let count = 0;
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    count += 1;
    stack.push(...node.children);
  }
  return count;
}

const round = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0);
const pageTitle = (page: DesignPage, index: number) => page.name.trim() || `Page ${index + 1}`;

/** Layer tree as an indented outline: `[kind] name (W×H)`, text layers quote their content. */
export function pageOutline(page: DesignPage, index: number): string {
  const lines = [`## Page ${index + 1}: ${pageTitle(page, index)}`, ""];
  const stack = [...page.rootNodes].reverse().map((node) => ({ node, depth: 0 }));
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    const indent = "  ".repeat(depth);
    const kind = node.kind === "other" ? node.rawType || "other" : node.kind;
    const flags = [
      node.visible ? "" : "hidden",
      node.fills.some((fill) => fill.type === "image") || node.imageRef ? "image fill" : "",
    ].filter(Boolean);
    const name = node.name.replace(/\s+/g, " ").trim() || "(unnamed)";
    lines.push(
      `${indent}- [${kind}] ${name} (${round(node.bounds.width)}×${round(node.bounds.height)})${flags.length ? ` {${flags.join(", ")}}` : ""}`,
    );
    for (const line of (node.text?.content ?? "").split(/\r?\n|\u2028/).map((value) => value.trim()).filter(Boolean)) {
      lines.push(`${indent}  > ${line}`);
    }
    for (let child = node.children.length - 1; child >= 0; child -= 1) {
      stack.push({ node: node.children[child]!, depth: depth + 1 });
    }
  }
  if (!page.rootNodes.length) lines.push("(empty page)");
  return lines.join("\n");
}

const designSourceExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const doc = await loadDocument(context);
    const counts = doc.pages.map((page) => countNodes(page.rootNodes));
    return {
      metadata: {
        format: FORMAT_NAMES[doc.format],
        title: doc.title,
        version: doc.version,
        ...(doc.exportedAt ? { exportedAt: doc.exportedAt } : {}),
        sizeBytes: context.source.size,
        ...doc.stats,
        hasThumbnail: Boolean(doc.thumbnail),
        fonts: doc.fonts.slice(0, 50),
        pages: doc.pages.map((page, index) => ({
          name: pageTitle(page, index),
          artboards: page.artboards.length,
          layers: counts[index]!,
        })),
      },
      targets: doc.pages.map((page, index) => ({
        id: `page:${index + 1}`,
        title: pageTitle(page, index),
        kind: "page",
        size: counts[index]!,
      })),
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const doc = await loadDocument(context);
    return readPagedTextDocument({
      pageCount: doc.pages.length,
      header: () => markdownDocumentHeader(doc.title, {
        Format: `${FORMAT_NAMES[doc.format]} (${doc.version})`,
        Pages: String(doc.stats.pageCount),
        Layers: String(doc.stats.nodeCount),
        ...(doc.fonts.length ? { Fonts: doc.fonts.slice(0, 50).join(", ") } : {}),
        ...(doc.pages.length ? {} : { Note: "Preview-only file: no layer data, only an embedded thumbnail." }),
      }),
      page: async (index) => pageOutline(doc.pages[index]!, index),
    }, params, PLUGIN_ID);
  },
};

export default designSourceExtractor;
