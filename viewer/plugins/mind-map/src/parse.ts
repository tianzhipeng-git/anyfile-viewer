import { ViewerError } from "@anyfile/viewer-protocol";
import { openBookZip } from "@anyfile/archive-metadata-viewer/zip-source";

export const LIMITS = { file: 128 * 1024 ** 2, content: 16 * 1024 ** 2, nodes: 20_000, depth: 128, sheets: 128, text: 4 * 1024 ** 2 };
export type { Topic, Sheet } from "./model";
import type { Topic, Sheet } from "./model";
import { loadAssets } from "./assets";
import type { WorkspaceReader } from "@anyfile/viewer-protocol";
import { jsonVisual, xmlVisual, jsonRelationships, xmlRelationships, kind, applyLegacyStyles, managerDefaults, managerRelationships } from "./visual-data";
export function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
}
const invalid = () => new ViewerError("invalid-file", "Invalid mind map.");
const limit = () => new ViewerError("resource-limit", "Mind map limit exceeded.");
const children = (element: Element | undefined, name: string): Element[] =>
  element ? Array.from(element.children).filter((child) => child.localName === name) : [];
const child = (element: Element | undefined, name: string) => children(element, name)[0];
const text = (element: Element | undefined) => element?.textContent?.trim() ?? "";
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const string = (value: unknown) => typeof value === "string" ? value : "";

function xml(source: string): Element {
  // No DTD/entities, external resources or active content is ever inserted into DOM.
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw invalid();
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || !doc.documentElement) throw invalid();
  return doc.documentElement;
}

function richText(element: Element | undefined): string {
  if (!element) return "";
  // Iterate instead of recursing: rich notes may contain deeply nested markup.
  const output: string[] = [];
  const stack: Node[] = [element];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.nodeType === 3) output.push(node.textContent ?? "");
    else if (node.nodeType === 1) {
      const tag = (node as Element).localName.toLowerCase();
      if (["script", "style", "iframe", "object"].includes(tag)) continue;
      if (["p", "div", "br", "li"].includes(tag)) output.push("\n");
      for (let i = node.childNodes.length - 1; i >= 0; i--) stack.push(node.childNodes[i]);
    }
  }
  return output.join("").trim();
}

export function parseContent(source: string, format: "xmind-json" | "xmind-xml" | "mmap" | "mm", signal: AbortSignal): Sheet[] {
  checkAbort(signal);
  if (source.length > LIMITS.content) throw limit();
  let count = 0, textSize = 0;
  function topic(title: string, notes: string, link: string, depth: number): Topic {
    checkAbort(signal);
    textSize += title.length + notes.length + link.length;
    if (++count > LIMITS.nodes || depth > LIMITS.depth || textSize > LIMITS.text) throw limit();
    return { id: `topic-${count}`, title, notes, link, children: [], kind: "attached", style: {}, structure: "", folded: false, markers: [], labels: [], metadata: {}, boundaries: [], relationships: [], attachments: [] };
  }
  function jsonTopic(value: unknown, depth: number, theme: Record<string, unknown> = {}, topicKind = "attached"): Topic {
    const data = record(value);
    const notes = data.notes == null ? {} : record(data.notes);
    const plain = notes.plain == null ? {} : record(notes.plain);
    const result = topic(string(data.title), string(plain.content), string(data.href), depth);
    const styleName = depth === 0 ? "centralTopic" : topicKind === "detached" ? "floatingTopic" : topicKind === "summary" ? "summaryTopic" : topicKind === "callout" ? "calloutTopic" : depth === 1 ? "mainTopic" : "subTopic";
    const base = theme[styleName] ? record(theme[styleName]) : {};
    const own = data.style ? record(data.style) : {};
    jsonVisual(result, { ...data, style: { properties: { ...(base.properties ? record(base.properties) : {}), ...(own.properties ? record(own.properties) : {}) } } });
    if (data.children != null) {
      const groups = record(data.children);
      for (const key of ["attached", "detached", "summary", "callout"]) {
        if (groups[key] == null) continue;
        if (!Array.isArray(groups[key])) throw invalid();
        for (const item of groups[key]) {
          const node = jsonTopic(item, depth + 1, theme, key); node.kind = kind(key); result.children.push(node);
        }
      }
    }
    return result;
  }
  let managerRoot: Element | undefined;
  function xmlTopic(element: Element, depth: number): Topic {
    let title: string, notes: string, link: string, nested: Element[];
    if (format === "mm") {
      const rich = children(element, "richcontent");
      title = element.getAttribute("TEXT") ?? richText(rich.find((item) => item.getAttribute("TYPE") === "NODE")).split("\n").map(line => line.trim()).filter(Boolean).join("\n");
      notes = rich.filter((item) => ["NOTE", "DETAILS"].includes(item.getAttribute("TYPE") ?? "")).map(richText).join("\n");
      link = element.getAttribute("LINK") ?? "";
      nested = children(element, "node");
    } else if (format === "mmap") {
      title = child(element, "Text")?.getAttribute("PlainText") ?? "";
      const note = child(child(element, "NotesGroup"), "NotesXhtmlData");
      notes = richText(note);
      // Some versions store XHTML notes as escaped XML instead of elements.
      if (note && !note.children.length && /^\s*</.test(notes)) notes = richText(xml(notes));
      link = (child(element, "Hyperlink") ?? child(child(element, "HyperlinkGroup"), "Hyperlink") ?? child(child(element, "HyperlinkGroup"), "IndexedHyperlink"))?.getAttribute("Url") ?? "";
      nested = [...children(child(element, "SubTopics"), "Topic"), ...children(child(element, "FloatingTopics"), "Topic")];
    } else {
      title = text(child(element, "title"));
      const note = child(element, "notes");
      notes = text(child(note, "plain")) || richText(child(note, "html"));
      link = element.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? element.getAttribute("href") ?? "";
      nested = children(child(element, "children"), "topics").flatMap((group) => children(group, "topic"));
    }
    const result = topic(title, notes, link, depth);
    if (format === "mmap" && managerRoot) managerDefaults(element, managerRoot, depth);
    xmlVisual(result, element, format);
    if (format === "xmind-xml") result.metadata.styleId = element.getAttribute("style-id") ?? "";
    for (const item of nested) {
      const node = xmlTopic(item, depth + 1);
      if (format === "xmind-xml") node.kind = kind(item.parentElement?.getAttribute("type") ?? "");
      if (format === "mmap" && item.parentElement?.localName === "FloatingTopics") node.kind = "detached";
      result.children.push(node);
    }
    return result;
  }
  let sheets: Sheet[];
  if (format === "xmind-json") {
    const data: unknown = JSON.parse(source);
    if (!Array.isArray(data) || !data.length) throw invalid();
    if (data.length > LIMITS.sheets) throw limit();
    sheets = data.map((value) => {
      const sheet = record(value);
      return { title: string(sheet.title), root: jsonTopic(sheet.rootTopic, 0, sheet.theme ? record(sheet.theme) : {}), relationships: jsonRelationships(sheet.relationships) };
    });
  } else {
    const root = xml(source);
    if (format === "mm") {
      if (root.localName !== "map" || children(root, "node").length !== 1) throw invalid();
      const node = xmlTopic(child(root, "node")!, 0);
      sheets = [{ title: node.title, root: node }];
    } else if (format === "mmap") {
      const topics = children(child(root, "OneTopic"), "Topic");
      if (root.localName !== "Map" || topics.length !== 1) throw invalid();
      managerRoot = root;
      const node = xmlTopic(topics[0], 0);
      sheets = [{ title: node.title, root: node, relationships: managerRelationships(root) }];
    } else {
      if (root.localName !== "xmap-content") throw invalid();
      const items = children(root, "sheet");
      if (!items.length) throw invalid();
      if (items.length > LIMITS.sheets) throw limit();
      sheets = items.map((item) => {
        if (children(item, "topic").length !== 1) throw invalid();
        return { title: text(child(item, "title")), root: xmlTopic(child(item, "topic")!, 0), relationships: xmlRelationships(item) };
      });
    }
  }
  checkAbort(signal);
  return sheets;
}

async function readText(file: File, signal: AbortSignal): Promise<string> {
  const reader = file.slice(0, file.size).stream().getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let size = 0;
  try {
    while (true) {
      checkAbort(signal);
      const result = await reader.read();
      checkAbort(signal);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > LIMITS.content) throw limit();
      parts.push(decoder.decode(result.value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join("");
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readMindMap(file: File, signal: AbortSignal, workspace?: WorkspaceReader): Promise<Sheet[]> {
  checkAbort(signal);
  if (file.size > LIMITS.file) throw limit();
  if (/\.mm$/i.test(file.name)) {
    const sheets = parseContent(await readText(file, signal), "mm", signal);
    await loadAssets(sheets, signal, undefined, workspace);
    return sheets;
  }
  if (!/\.(xmind|mmap)$/i.test(file.name)) throw invalid();
  const zip = await openBookZip(file, signal);
  try {
    const isXmind = /\.xmind$/i.test(file.name);
    const path = isXmind ? (zip.entries.has("content.json") ? "content.json" : "content.xml") : "Document.xml";
    if (!zip.entries.has(path)) throw invalid();
    const bytes = await zip.read(path, LIMITS.content, signal);
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const sheets = parseContent(source, isXmind ? (path.endsWith("json") ? "xmind-json" : "xmind-xml") : "mmap", signal);
    if (zip.entries.has("styles.xml")) {
      const styles = new TextDecoder().decode(await zip.read("styles.xml", LIMITS.content, signal));
      xml(styles);
      applyLegacyStyles(sheets, styles);
    }
    await loadAssets(sheets, signal, zip);
    return sheets;
  } finally {
    await zip.dispose();
  }
}
