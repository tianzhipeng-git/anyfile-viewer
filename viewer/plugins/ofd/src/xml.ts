import { parseXmlDocument } from "@anyfile/runtime-assets/xml";
import { OfdFormatError } from "./package";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

/**
 * Parses an XML part. Producers vary the `ofd:` namespace, so lookups match on `localName`.
 * CDATA sections (used for invoice `TextCode`s) are rewritten as escaped text first so every
 * DOMParser implementation yields the same text nodes.
 */
export function parseXml(text: string): Element {
  const normalized = text
    .replace(/^﻿/, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, data: string) => data.replace(/[&<>]/g, (char) => ESCAPES[char]!));
  const doc = parseXmlDocument(normalized, "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName === "parsererror" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new OfdFormatError("Malformed XML part.");
  }
  return root;
}

export function children(element: Element, localName: string): Element[] {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

export function child(element: Element, localName: string): Element | undefined {
  return Array.from(element.children).find((node) => node.localName === localName);
}

/** Follows a chain of child names, e.g. `childPath(doc, "CommonData", "PageArea")`. */
export function childPath(element: Element, ...names: string[]): Element | undefined {
  let current: Element | undefined = element;
  for (const name of names) current = current && child(current, name);
  return current;
}

export function childText(element: Element, ...names: string[]) {
  return childPath(element, ...names)?.textContent?.trim() || undefined;
}

export function numbers(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
    .filter((item) => Number.isFinite(item));
}

export function numberAttr(element: Element, name: string): number | undefined {
  const raw = element.getAttribute(name);
  if (raw === null) return undefined;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function boolAttr(element: Element, name: string): boolean | undefined {
  const raw = element.getAttribute(name)?.trim().toLowerCase();
  return raw === "true" || raw === "1" ? true : raw === "false" || raw === "0" ? false : undefined;
}

/** `ST_Box` ("x y w h") with a positive size. */
export function parseBox(value: string | null | undefined) {
  const box = numbers(value);
  if (box.length < 4 || !(box[2]! > 0) || !(box[3]! > 0)) return undefined;
  return { x: box[0]!, y: box[1]!, width: box[2]!, height: box[3]! };
}

export type Box = NonNullable<ReturnType<typeof parseBox>>;
