import type { PagedOutlineItem } from "@anyfile/viewer-rendering/paged";

import { OFD_LIMITS } from "./limits";
import { OfdFormatError, OfdLimitError, dirOf, type OfdPackage } from "./package";
import { ResourceTable, loadResources } from "./res";
import { child, childPath, childText, children, parseBox, parseXml, type Box } from "./xml";

export interface PageRef {
  readonly id: string;
  readonly part: string;
}

export interface TemplateRef {
  readonly part: string;
  readonly zOrder: "Background" | "Foreground";
}

export interface StampRef {
  readonly boundary: Box;
  /** Package path of the signature value (and optional seal file) that holds the stamp picture. */
  readonly sources: readonly string[];
}

export interface OfdDocument {
  readonly pkg: OfdPackage;
  readonly pages: readonly PageRef[];
  readonly pageArea: Box;
  readonly templates: ReadonlyMap<string, TemplateRef>;
  readonly resources: ResourceTable;
  readonly outline: readonly PagedOutlineItem[];
  /** Annotation part paths by page ID. */
  readonly annotations: ReadonlyMap<string, readonly string[]>;
  /** Electronic seal stamps by page ID. */
  readonly stamps: ReadonlyMap<string, readonly StampRef[]>;
  /** `Signature` entries listed by the signature list (with or without a stamp). */
  readonly signatureCount: number;
  /** `DocInfo` fields (`Title`, `Author`, `CreationDate`…; custom data as `Custom:<Name>`). */
  readonly info: Readonly<Record<string, string>>;
}

const A4: Box = { x: 0, y: 0, width: 210, height: 297 };
const MAX_INFO_FIELDS = 64;

async function optionalXml(pkg: OfdPackage, path: string | undefined) {
  if (!path) return undefined;
  try {
    return parseXml(await pkg.text(path));
  } catch (error) {
    if (error instanceof OfdFormatError) return undefined; // Optional parts never block the pages.
    throw error;
  }
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}

function readOutline(root: Element | undefined, pageIndex: ReadonlyMap<string, number>) {
  let budget = OFD_LIMITS.outlineEntries;
  const visit = (parent: Element): PagedOutlineItem[] => {
    const items: PagedOutlineItem[] = [];
    for (const elem of children(parent, "OutlineElem")) {
      if (budget-- <= 0) break;
      const dest = childPath(elem, "Actions", "Action", "Goto", "Dest");
      const page = pageIndex.get(dest?.getAttribute("PageID")?.trim() ?? "");
      const nested = visit(elem);
      const title = elem.getAttribute("Title")?.trim() ?? "";
      if (page !== undefined && title) items.push({ title, page, children: nested });
      else items.push(...nested);
    }
    return items;
  };
  return root ? visit(root) : [];
}

async function readAnnotations(pkg: OfdPackage, path: string | undefined) {
  const result = new Map<string, string[]>();
  const root = await optionalXml(pkg, path);
  if (!root || !path) return result;
  for (const page of children(root, "Page")) {
    const part = pkg.resolve(dirOf(path), childText(page, "FileLoc"));
    if (part) push(result, page.getAttribute("PageID")?.trim() ?? "", part);
  }
  return result;
}

async function readSignatures(pkg: OfdPackage, path: string | undefined) {
  const result = new Map<string, StampRef[]>();
  const list = await optionalXml(pkg, path);
  if (!list || !path) return { stamps: result, count: 0 };
  const entries = children(list, "Signature");
  for (const entry of entries) {
    const signaturePath = pkg.resolve(dirOf(path), entry.getAttribute("BaseLoc"));
    const signature = await optionalXml(pkg, signaturePath);
    if (!signature || !signaturePath) continue;
    const dir = dirOf(signaturePath);
    const sources = [
      pkg.resolve(dir, childText(signature, "SignedValue")),
      pkg.resolve(dir, childText(signature, "SignedInfo", "Seal", "BaseLoc")),
    ].filter((source): source is string => !!source);
    if (!sources.length) continue;
    for (const stamp of children(child(signature, "SignedInfo") ?? signature, "StampAnnot")) {
      const boundary = parseBox(stamp.getAttribute("Boundary"));
      const page = stamp.getAttribute("PageRef")?.trim();
      if (boundary && page) push(result, page, { boundary, sources });
    }
  }
  return { stamps: result, count: entries.length };
}

function readDocInfo(docInfo: Element | undefined) {
  const info: Record<string, string> = {};
  for (const field of docInfo ? Array.from(docInfo.children).slice(0, MAX_INFO_FIELDS) : []) {
    if (field.localName === "Keywords") {
      const keywords = children(field, "Keyword").map((keyword) => keyword.textContent?.trim()).filter(Boolean);
      if (keywords.length) info.Keywords = keywords.join(", ");
    } else if (field.localName === "CustomDatas") {
      for (const data of children(field, "CustomData").slice(0, MAX_INFO_FIELDS)) {
        const name = data.getAttribute("Name")?.trim();
        const value = data.textContent?.trim();
        if (name && value) info[`Custom:${name}`] = value;
      }
    } else if (!field.children.length) {
      const value = field.textContent?.trim();
      if (value) info[field.localName] = value;
    }
  }
  return info;
}

/** Follows `OFD.xml` → `DocRoot` (first document) and reads the page list and shared parts. */
export async function loadOfdDocument(pkg: OfdPackage): Promise<OfdDocument> {
  const entry = parseXml(await pkg.text("OFD.xml"));
  if (entry.localName !== "OFD") throw new OfdFormatError("Missing OFD root.");
  const body = child(entry, "DocBody");
  const docPath = body && pkg.resolve("", childText(body, "DocRoot"));
  if (!body || !docPath) throw new OfdFormatError("Missing DocRoot.");
  const doc = parseXml(await pkg.text(docPath));
  const docDir = dirOf(docPath);

  const pages: PageRef[] = [];
  for (const page of children(child(doc, "Pages") ?? doc, "Page")) {
    const part = pkg.resolve(docDir, page.getAttribute("BaseLoc"));
    if (!part) continue;
    if (pages.length >= OFD_LIMITS.pages) throw new OfdLimitError("Too many pages.");
    pages.push({ id: page.getAttribute("ID")?.trim() ?? "", part });
  }
  if (!pages.length) throw new OfdFormatError("The document has no pages.");

  const common = child(doc, "CommonData");
  const resources = new ResourceTable();
  const templates = new Map<string, TemplateRef>();
  if (common) {
    for (const name of ["PublicRes", "DocumentRes"]) {
      for (const res of children(common, name)) {
        const part = pkg.resolve(docDir, res.textContent);
        if (part) await loadResources(pkg, part, resources).catch((error: unknown) => {
          if (!(error instanceof OfdFormatError)) throw error;
        });
      }
    }
    for (const template of children(common, "TemplatePage")) {
      const part = pkg.resolve(docDir, template.getAttribute("BaseLoc"));
      const zOrder = template.getAttribute("ZOrder") === "Foreground" ? "Foreground" : "Background";
      if (part) templates.set(template.getAttribute("ID")?.trim() ?? "", { part, zOrder });
    }
  }

  const pageIndex = new Map(pages.map((page, index) => [page.id, index]));
  const signatures = await readSignatures(pkg, pkg.resolve("", childText(body, "Signatures")));
  return {
    pkg,
    pages,
    pageArea: parseBox(childText(doc, "CommonData", "PageArea", "PhysicalBox")) ?? A4,
    templates,
    resources,
    outline: readOutline(child(doc, "Outlines"), pageIndex),
    annotations: await readAnnotations(pkg, pkg.resolve(docDir, childText(doc, "Annotations"))),
    stamps: signatures.stamps,
    signatureCount: signatures.count,
    info: readDocInfo(child(body, "DocInfo")),
  };
}
