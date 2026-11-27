import type { PagedOutlineItem } from "@anyfile/viewer-rendering/paged";

import { XPS_LIMITS } from "./limits";
import { buildPage, dictionarySources, type XpsPage } from "./model";
import { XpsFormatError, XpsLimitError, partKey, resolvePart, uriFragment, type XpsPackage } from "./package";
import { attrLocal, childNamed, childrenNamed, descendantsNamed, elementChildren, parseXml } from "./xml";

export interface XpsPageRef {
  /** FixedPage part name. */
  readonly part: string;
  readonly width?: number;
  readonly height?: number;
}

export interface XpsDocumentModel {
  readonly pages: readonly XpsPageRef[];
  readonly outline: readonly PagedOutlineItem[];
  readonly openXps: boolean;
  /** FixedDocument part names in sequence order. */
  readonly documents: readonly string[];
}

const FIXED_REPRESENTATION = /\/fixedrepresentation$/i;
const DOCUMENT_STRUCTURE = /\/documentstructure$/i;
const CORE_PROPERTIES = /\/core-properties$/i;
const MAX_PROPERTIES = 64;

function positive(value: string | null) {
  const number = value === null ? Number.NaN : Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

async function findSequencePart(pkg: XpsPackage) {
  const rels = await pkg.relationships("");
  const fromRels = rels.find((rel) => FIXED_REPRESENTATION.test(rel.type) && pkg.has(rel.target));
  if (fromRels) return fromRels.target;
  // Some producers omit the package relationship; fall back to the only sequence part.
  return pkg.names.find((name) => name.endsWith(".fdseq"));
}

interface DocumentPages {
  readonly pages: XpsPageRef[];
  /** LinkTarget name → page index, and page part key → page index. */
  readonly targets: Map<string, number>;
}

async function readFixedDocument(pkg: XpsPackage, part: string, out: DocumentPages) {
  const root = parseXml(await pkg.text(part));
  if (root.localName !== "FixedDocument") throw new XpsFormatError("Not a FixedDocument.");
  for (const content of childrenNamed(root, "PageContent")) {
    const page = resolvePart(part, content.getAttribute("Source") ?? "");
    if (!page) continue;
    if (out.pages.length >= XPS_LIMITS.pages) throw new XpsLimitError("Too many pages.");
    const index = out.pages.length;
    out.pages.push({ part: page, width: positive(content.getAttribute("Width")), height: positive(content.getAttribute("Height")) });
    out.targets.set(partKey(page), index);
    const holder = childNamed(content, "PageContent.LinkTargets");
    for (const target of holder ? childrenNamed(holder, "LinkTarget") : []) {
      const name = target.getAttribute("Name");
      if (name && !out.targets.has(name)) out.targets.set(name, index);
    }
  }
}

function resolveOutlineTarget(base: string, target: string, targets: Map<string, number>) {
  const fragment = uriFragment(target);
  if (fragment && targets.has(fragment)) return targets.get(fragment);
  const part = resolvePart(base, target);
  return part ? targets.get(partKey(part)) : undefined;
}

/** Builds a tree from the flat `OutlineEntry` list using `OutlineLevel`. */
async function readOutline(pkg: XpsPackage, documents: readonly string[], targets: Map<string, number>) {
  const roots: { title: string; page: number; children: PagedOutlineItem[] }[] = [];
  const stack: { level: number; children: PagedOutlineItem[] }[] = [{ level: 0, children: roots }];
  let count = 0;
  for (const document of documents) {
    const structure = (await pkg.relationships(document)).find((rel) => DOCUMENT_STRUCTURE.test(rel.type));
    if (!structure || !pkg.has(structure.target)) continue;
    let root: Element;
    try {
      root = parseXml(await pkg.text(structure.target));
    } catch (error) {
      if (error instanceof XpsFormatError) continue; // A broken outline must not block the pages.
      throw error;
    }
    for (const entry of descendantsNamed(root, "OutlineEntry")) {
      if (++count > XPS_LIMITS.outlineEntries) return roots;
      const page = resolveOutlineTarget(structure.target, entry.getAttribute("OutlineTarget") ?? "", targets);
      const title = (attrLocal(entry, "Description") ?? "").trim();
      if (page === undefined || !title) continue;
      const level = Math.max(1, Math.min(9, Number.parseInt(entry.getAttribute("OutlineLevel") ?? "1", 10) || 1));
      while (stack.length > 1 && stack.at(-1)!.level >= level) stack.pop();
      const item = { title, page, children: [] as PagedOutlineItem[] };
      stack.at(-1)!.children.push(item);
      stack.push({ level, children: item.children });
    }
  }
  return roots;
}

export async function loadXpsDocument(pkg: XpsPackage): Promise<XpsDocumentModel> {
  const sequence = await findSequencePart(pkg);
  const out: DocumentPages = { pages: [], targets: new Map() };
  const documents: string[] = [];
  let openXps = false;
  if (sequence) {
    const root = parseXml(await pkg.text(sequence));
    if (root.localName !== "FixedDocumentSequence") throw new XpsFormatError("Not a FixedDocumentSequence.");
    openXps = (root.namespaceURI ?? "").includes("openxps");
    for (const reference of elementChildren(root).filter((node) => node.localName === "DocumentReference")) {
      const part = resolvePart(sequence, reference.getAttribute("Source") ?? "");
      if (part && pkg.has(part)) documents.push(part);
    }
  } else {
    const fdoc = pkg.names.find((name) => name.endsWith(".fdoc"));
    if (fdoc) documents.push(fdoc);
  }
  for (const document of documents) await readFixedDocument(pkg, document, out);
  const pages = out.pages.filter((page) => pkg.has(page.part));
  if (pages.length === 0) throw new XpsFormatError("The package has no fixed pages.");
  // Outline indices refer to the unfiltered list; only drop it when pages went missing.
  const outline = pages.length === out.pages.length ? await readOutline(pkg, documents, out.targets) : [];
  return { pages, outline, openXps, documents };
}

/** Parses one FixedPage part (plus any remote resource dictionaries it references). */
export async function loadXpsPage(pkg: XpsPackage, part: string): Promise<XpsPage> {
  const root = parseXml(await pkg.text(part));
  if (root.localName !== "FixedPage") throw new XpsFormatError("Not a FixedPage.");
  const dictionaries = new Map<string, Element>();
  for (const source of dictionarySources(root, part)) {
    if (!pkg.has(source)) continue;
    const dictionary = parseXml(await pkg.text(source));
    if (dictionary.localName === "ResourceDictionary") dictionaries.set(source, dictionary);
  }
  return buildPage(root, part, dictionaries);
}

/** OPC core properties (`dc:title`, `dc:creator`, `dcterms:created`…) keyed by local name. */
export async function loadXpsProperties(pkg: XpsPackage): Promise<Record<string, string>> {
  const rel = (await pkg.relationships("")).find((item) => CORE_PROPERTIES.test(item.type) && pkg.has(item.target));
  const properties: Record<string, string> = {};
  if (!rel) return properties;
  let root: Element;
  try {
    root = parseXml(await pkg.text(rel.target));
  } catch (error) {
    if (error instanceof XpsFormatError) return properties; // Optional part; never blocks the pages.
    throw error;
  }
  for (const node of elementChildren(root).slice(0, MAX_PROPERTIES)) {
    const value = node.textContent?.trim();
    if (value && !node.children.length) properties[node.localName] = value;
  }
  return properties;
}
