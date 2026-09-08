import { ViewerError } from "@anyfile/viewer-protocol";
export const MARKUP_LIMITS = {
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
    if (depth > MARKUP_LIMITS.depth || count > MARKUP_LIMITS.nodes)
      throw new ViewerError("resource-limit", "XML structure limit exceeded.");
    for (const child of Array.from(node.children)) stack.push([child, depth + 1]);
  }
  return doc;
}
export function elements(root: ParentNode, name: string): Element[] {
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
