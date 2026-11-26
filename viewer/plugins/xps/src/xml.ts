import { parseXmlDocument } from "@anyfile/runtime-assets/xml";
import { XpsFormatError } from "./package";

/** Parses an XML part. XPS and OpenXPS differ only in namespaces, so callers match on `localName`. */
export function parseXml(text: string): Element {
  const doc = parseXmlDocument(text.replace(/^﻿/, ""), "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName === "parsererror" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new XpsFormatError("Malformed XML part.");
  }
  return root;
}

/**
 * Element children, with Markup Compatibility `AlternateContent` flattened to its `Fallback`
 * branch (Choice branches require namespaces this renderer does not understand).
 */
export function elementChildren(element: Element): Element[] {
  const out: Element[] = [];
  for (const child of Array.from(element.children)) {
    if (child.localName === "AlternateContent") {
      const fallback = Array.from(child.children).find((node) => node.localName === "Fallback");
      if (fallback) out.push(...elementChildren(fallback));
    } else {
      out.push(child);
    }
  }
  return out;
}

export function childNamed(element: Element, localName: string) {
  return elementChildren(element).find((child) => child.localName === localName);
}

export function childrenNamed(element: Element, localName: string) {
  return elementChildren(element).filter((child) => child.localName === localName);
}

/** The first element inside a property element such as `<Path.Fill>`. */
export function propertyValue(element: Element, property: string) {
  const holder = childNamed(element, `${element.localName}.${property}`);
  return holder ? elementChildren(holder)[0] : undefined;
}

/** Attribute lookup by local name (handles `x:Key` regardless of prefix). */
export function attrLocal(element: Element, localName: string) {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name;
    if (attribute.localName === localName || name === localName || name.endsWith(`:${localName}`)) return attribute.value;
  }
  return undefined;
}

export function numberAttr(element: Element, name: string, fallback: number) {
  const raw = element.getAttribute(name);
  if (raw === null) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function numberList(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
    .filter((item) => Number.isFinite(item));
}

/** Descendants by local name in any namespace (XPS and OpenXPS share local names). */
export function descendantsNamed(root: Element, localName: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter((node) => node.localName === localName);
}
