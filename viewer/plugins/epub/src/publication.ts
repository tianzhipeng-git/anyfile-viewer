import { ViewerError } from "@anyfile/viewer-protocol";
import { ProtectedBookError, type BookZip } from "@anyfile/archive-metadata-viewer/zip-source";

export const EPUB_LIMITS = {
  xml: 2 * 1024 * 1024,
  chapter: 2 * 1024 * 1024,
  nodes: 20_000,
  depth: 64,
  chapters: 2000,
  resources: 64,
  resourceBytes: 32 * 1024 * 1024,
  font: 4 * 1024 * 1024,
  fonts: 8,
};
export function parseXml(bytes: Uint8Array): XMLDocument {
  let source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(source))
    throw new ViewerError("invalid-file", "XML entities are not supported.");
  source = source.replace(/<!DOCTYPE[^>]*>/gi, "");
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new ViewerError("invalid-file", "Invalid XML.");
  const stack: [Element, number][] = [[doc.documentElement, 1]];
  let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    count += 1 + node.childNodes.length;
    if (depth > EPUB_LIMITS.depth || count > EPUB_LIMITS.nodes)
      throw new ViewerError("resource-limit", "XML structure limit exceeded.");
    for (const child of Array.from(node.children)) stack.push([child, depth + 1]);
  }
  return doc;
}
export function elements(root: Document | Element, name: string): Element[] {
  return Array.from(root.querySelectorAll("*")).filter((node) => node.localName === name);
}
export function localReference(
  base: string,
  reference: string,
): { path: string; fragment: string } | null {
  if (/[\x00-\x20\\]/.test(reference) || /^(?:[a-z][\w+.-]*:|\/)/i.test(reference)) return null;
  const [rawPath, rawFragment = ""] = reference.split("#", 2);
  try {
    const parts = rawPath ? base.split("/").slice(0, -1) : [];
    if (rawPath)
      for (const part of decodeURIComponent(rawPath).split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") {
          if (!parts.length) return null;
          parts.pop();
        } else if (/[:?\\\x00-\x1f]/.test(part)) return null;
        else parts.push(part);
      }
    return { path: rawPath ? parts.join("/") : base, fragment: decodeURIComponent(rawFragment) };
  } catch {
    return null;
  }
}
export interface PublicationItem {
  id: string;
  path: string;
  type: string;
  properties: string[];
}
export interface TocItem {
  label: string;
  path: string;
  fragment: string;
}
export interface Publication {
  title: string;
  author: string;
  direction: "ltr" | "rtl";
  items: Map<string, PublicationItem>;
  spine: PublicationItem[];
  toc: TocItem[];
}
export async function parsePublication(zip: BookZip, signal: AbortSignal): Promise<Publication> {
  const text = new TextDecoder().decode(await zip.read("mimetype", 64, signal));
  if (text !== "application/epub+zip")
    throw new ViewerError("invalid-file", "Invalid EPUB media type.");
  if (zip.entries.has("META-INF/encryption.xml") || zip.entries.has("META-INF/rights.xml"))
    throw new ProtectedBookError("Protected or obfuscated EPUB");
  const container = parseXml(await zip.read("META-INF/container.xml", EPUB_LIMITS.xml, signal));
  const roots = elements(container, "rootfile");
  if (roots.length !== 1)
    throw new ViewerError("invalid-file", "EPUB requires one package document.");
  const root = roots[0].getAttribute("full-path") ?? "";
  const rootRef = localReference("", root);
  if (!rootRef?.path) throw new ViewerError("invalid-file", "Invalid package path.");
  const opf = parseXml(await zip.read(rootRef.path, EPUB_LIMITS.xml, signal));
  if (
    opf.documentElement.localName !== "package" ||
    !/^[23](?:\.|$)/.test(opf.documentElement.getAttribute("version") ?? "")
  )
    throw new ViewerError("invalid-file", "Unsupported EPUB package.");
  if (
    elements(opf, "meta").some(
      (node) =>
        node.getAttribute("property") === "rendition:layout" &&
        node.textContent?.trim() === "pre-paginated",
    )
  )
    throw new ProtectedBookError("Fixed-layout EPUB is not supported");
  const items = new Map<string, PublicationItem>();
  const byId = new Map<string, PublicationItem>();
  for (const node of elements(opf, "item")) {
    const reference = localReference(rootRef.path, node.getAttribute("href") ?? "");
    if (!reference) continue;
    const item = {
      id: node.getAttribute("id") ?? "",
      path: reference.path,
      type: node.getAttribute("media-type") ?? "",
      properties: (node.getAttribute("properties") ?? "").split(/\s+/),
    };
    if (!item.id || byId.has(item.id) || items.has(item.path))
      throw new ViewerError("invalid-file", "Duplicate EPUB manifest item.");
    byId.set(item.id, item);
    items.set(item.path, item);
  }
  const spineNode = elements(opf, "spine")[0];
  if (!spineNode) throw new ViewerError("invalid-file", "Missing EPUB spine.");
  const spine = elements(spineNode, "itemref")
    .filter((node) => node.getAttribute("linear") !== "no")
    .map((node) => {
      const item = byId.get(node.getAttribute("idref") ?? "");
      if (!item || !zip.entries.has(item.path))
        throw new ViewerError("missing-related-file", "Missing EPUB chapter.");
      if (item.type !== "application/xhtml+xml")
        throw new ViewerError("invalid-file", "Unsupported EPUB spine content.");
      return item;
    });
  if (!spine.length) throw new ViewerError("invalid-file", "Empty EPUB spine.");
  if (spine.length > EPUB_LIMITS.chapters)
    throw new ViewerError("resource-limit", "EPUB chapter limit exceeded.");
  const nav = [...items.values()].find((item) => item.properties.includes("nav"));
  const ncx = byId.get(spineNode.getAttribute("toc") ?? "");
  const toc: TocItem[] = [];
  if (nav || ncx) {
    const item = (nav ?? ncx)!;
    const doc = parseXml(await zip.read(item.path, EPUB_LIMITS.xml, signal));
    if (nav) {
      const navigation = elements(doc, "nav").find((node) =>
        (
          node.getAttribute("epub:type") ??
          node.getAttributeNS("http://www.idpf.org/2007/ops", "type") ??
          ""
        )
          .split(/\s+/)
          .includes("toc"),
      );
      for (const a of navigation ? elements(navigation, "a") : []) {
        const target = localReference(item.path, a.getAttribute("href") ?? "");
        if (target && spine.some((section) => section.path === target.path))
          toc.push({ ...target, label: a.textContent?.trim() || target.path });
      }
    } else
      for (const point of elements(doc, "navPoint")) {
        const target = localReference(
          item.path,
          elements(point, "content")[0]?.getAttribute("src") ?? "",
        );
        if (target && spine.some((section) => section.path === target.path))
          toc.push({
            ...target,
            label: elements(point, "text")[0]?.textContent?.trim() || target.path,
          });
      }
  }
  if (!toc.length)
    toc.push(...spine.map((item) => ({ label: item.id, path: item.path, fragment: "" })));
  return {
    title: elements(opf, "title")[0]?.textContent ?? "",
    author: elements(opf, "creator")[0]?.textContent ?? "",
    direction: spineNode.getAttribute("page-progression-direction") === "rtl" ? "rtl" : "ltr",
    items,
    spine,
    toc,
  };
}
