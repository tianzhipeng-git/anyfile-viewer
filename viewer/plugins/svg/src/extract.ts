import { parseXmlDocument } from "@anyfile/runtime-assets/xml";
import {
  AgentError,
  HARD_READ_MAX_BYTES,
  abortError,
  isViewerAbortError,
  paginateLines,
  paginateText,
  type ExtractContext,
  type InspectPayload,
  type JsonValue,
  type ReadParams,
  type ReadResult,
  type StructuredExtractor,
} from "@anyfile/viewer-protocol";

import { readSvgBytes } from "./read";
import { decodeXml } from "./sanitize";

const PLUGIN_ID = "safe-svg";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_ELEMENTS = 100_000;
/** Data URIs longer than this are replaced by a byte-count placeholder in the `source` target. */
const DATA_URI_KEEP = 128;
const DATA_URI = /data:([\w.+-]+\/[\w.+-]+)?((?:;[\w.+-]+(?:=[\w.+-]+)?)*),([^"'()\s<>]*)/gi;
const SKIPPED_TEXT = new Set(["script", "style"]);

interface SvgDocument {
  readonly source: string;
  readonly root: Element;
  readonly elements: readonly Element[];
  readonly compressed: boolean;
}

function mapError(error: unknown): never {
  if (error instanceof AgentError || isViewerAbortError(error)) throw error;
  if (error instanceof RangeError) {
    throw new AgentError("resource-limit", "The SVG exceeds the 128 MiB safety limit.", { pluginId: PLUGIN_ID, cause: error });
  }
  throw new AgentError("invalid-file", "The file is not a valid, complete SVG.", { pluginId: PLUGIN_ID, cause: error });
}

async function loadSvg(context: ExtractContext): Promise<SvgDocument> {
  if (context.signal.aborted) throw abortError();
  try {
    const { bytes, compressed } = await readSvgBytes(context.file, context.signal);
    const source = decodeXml(bytes);
    if (/<!doctype/i.test(source)) throw new TypeError("SVG DOCTYPE is not allowed.");
    const document = parseXmlDocument(source, "image/svg+xml");
    const root = document.documentElement;
    if (
      !root
      || root.localName.toLowerCase() !== "svg"
      || root.namespaceURI !== SVG_NAMESPACE
      || document.getElementsByTagName("parsererror").length > 0
    ) throw new TypeError("Not an SVG document.");
    const elements = [root, ...Array.from(root.querySelectorAll("*"))];
    if (elements.length > MAX_ELEMENTS) throw new RangeError("SVG element limit exceeded.");
    if (context.signal.aborted) throw abortError();
    return { source, root, elements, compressed };
  } catch (error) {
    return mapError(error);
  }
}

const collapse = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

function childText(root: Element, name: string) {
  return collapse(Array.from(root.children).find((child) => child.localName === name)?.textContent);
}

function href(element: Element) {
  return (element.getAttribute("href") ?? element.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? "").trim();
}

/** Text in document order: `<text>` (one line per positioned `<tspan>`), `<title>`, `<desc>` and `<foreignObject>`. */
function textLines(root: Element): string[] {
  const lines: string[] = [];
  const stack: Element[] = [root];
  while (stack.length) {
    const element = stack.pop()!;
    const name = element.localName;
    if (SKIPPED_TEXT.has(name)) continue;
    if (name === "text") {
      const positioned = Array.from(element.children).filter(
        (child) => child.localName === "tspan" && ["x", "y", "dy"].some((attribute) => child.hasAttribute(attribute)),
      );
      if (positioned.length > 1) {
        for (const tspan of positioned) {
          const value = collapse(tspan.textContent);
          if (value) lines.push(value);
        }
      } else {
        const value = collapse(element.textContent);
        if (value) lines.push(value);
      }
      continue;
    }
    if (name === "title" || name === "desc" || name === "foreignObject") {
      const value = collapse(element.textContent);
      if (value) lines.push(name === "foreignObject" ? value : `[${name}] ${value}`);
      continue;
    }
    for (let index = element.children.length - 1; index >= 0; index -= 1) stack.push(element.children[index]!);
  }
  return lines;
}

/** Raw source with long data URIs shortened so embedded images and fonts never flood the context. */
export function abbreviateDataUris(source: string): string {
  return source.replace(DATA_URI, (match, mime: string | undefined, params: string, payload: string) => {
    if (match.length <= DATA_URI_KEEP) return match;
    const base64 = /;base64/i.test(params);
    const bytes = base64 ? Math.floor((payload.replace(/=+$/, "").length * 3) / 4) : payload.length;
    return `data:${mime ?? ""}${params},<binary ${bytes} bytes>`;
  });
}

function countBy(elements: readonly Element[]) {
  const counts = new Map<string, number>();
  for (const element of elements) counts.set(element.localName, (counts.get(element.localName) ?? 0) + 1);
  return Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]).slice(0, 30)) as Record<string, JsonValue>;
}

function filterLines(lines: readonly string[], filter: string | undefined) {
  const needle = filter?.trim().toLowerCase();
  return needle ? lines.filter((line) => line.toLowerCase().includes(needle)) : undefined;
}

const svgExtractor: StructuredExtractor = {
  async inspect(context: ExtractContext): Promise<InspectPayload> {
    const { source, root, elements, compressed } = await loadSvg(context);
    const images = elements.filter((element) => element.localName === "image");
    const embeddedImages = images.filter((element) => href(element).startsWith("data:")).length;
    const eventHandlers = elements.filter((element) =>
      Array.from(element.attributes).some((attribute) => attribute.localName.toLowerCase().startsWith("on"))).length;
    const styleText = elements.filter((element) => element.localName === "style").map((element) => element.textContent ?? "").join("\n");
    const lines = textLines(root);
    const optional = (name: string) => root.getAttribute(name) ?? undefined;
    return {
      metadata: {
        format: compressed ? "SVGZ" : "SVG",
        sizeBytes: context.source.size,
        ...(compressed ? { decodedBytes: new TextEncoder().encode(source).byteLength } : {}),
        ...(optional("width") ? { width: optional("width")! } : {}),
        ...(optional("height") ? { height: optional("height")! } : {}),
        ...(optional("viewBox") ? { viewBox: optional("viewBox")! } : {}),
        ...(childText(root, "title") ? { title: childText(root, "title") } : {}),
        ...(childText(root, "desc") ? { description: childText(root, "desc") } : {}),
        elementCount: elements.length,
        elementCounts: countBy(elements),
        textLines: lines.length,
        embeddedImages,
        externalImages: images.length - embeddedImages,
        embeddedFonts: elements.filter((element) => element.localName === "font" || element.localName === "font-face").length
          + (styleText.match(/@font-face/gi)?.length ?? 0),
        scripts: elements.filter((element) => element.localName === "script").length,
        eventHandlerElements: eventHandlers,
        foreignObjects: elements.filter((element) => element.localName === "foreignObject").length,
      },
      targets: [
        { id: "text", title: "Text content", kind: "text", size: lines.length },
        { id: "source", title: "SVG source (data URIs abbreviated)", kind: "source", size: source.length },
      ],
    };
  },

  async read(context: ExtractContext, params: ReadParams): Promise<ReadResult> {
    const target = params.target ?? "text";
    if (target !== "text" && target !== "source") {
      throw new AgentError("target-not-found", `SVG target not found: "${target}".`, { pluginId: PLUGIN_ID });
    }
    const svg = await loadSvg(context);
    const maxBytes = Math.min(params.maxBytes, HARD_READ_MAX_BYTES);
    const lines = target === "text" ? textLines(svg.root) : undefined;
    const source = target === "source" ? abbreviateDataUris(svg.source) : undefined;
    const filtered = filterLines(lines ?? source!.split("\n"), params.filter);
    if (filtered) {
      return { contentType: "text", ...paginateLines(filtered, params.cursor, maxBytes, PLUGIN_ID), filterApplied: true };
    }
    if (lines) return { contentType: "text", ...paginateLines(lines, params.cursor, maxBytes, PLUGIN_ID) };
    return paginateText(source!, params.cursor, maxBytes, "text", PLUGIN_ID);
  },
};

export default svgExtractor;
