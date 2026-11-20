import { ViewerError, type Locale } from "@anyfile/viewer-protocol";
import type { BookEntry, BookSource } from "@anyfile/archive-metadata-viewer/book-source";
import type { Publication, PublicationItem, TocItem } from "@anyfile/rendering-publication/markup";
import type { PublicationSource, TocTreeNode } from "@anyfile/rendering-publication";
import { prepareChapter } from "@anyfile/rendering-publication/safe-content";
import {
  normalizeChmPath,
  resolveChmEntry,
  type ChmMetadata,
  type ChmTocNode,
} from "./chm-metadata";
import { decodeChmText } from "./encoding";
import type { ChmDirectory, ChmEntry } from "./itsf";
import { CHM_LIMITS } from "./limits";
import type { ChmSectionReader } from "./section-reader";
import { chmCopy } from "./ui";

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".xhtml": "text/html",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

function chmMimeType(lowerPath: string): string {
  const dot = lowerPath.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME_BY_EXT[lowerPath.slice(dot)] ?? "application/octet-stream";
}

function isHtmlEntry(entry: ChmEntry): boolean {
  if (entry.path.startsWith("::") || entry.path.startsWith("/#") || entry.path.startsWith("/$")) {
    return false;
  }
  return (
    entry.lowerPath.endsWith(".html") ||
    entry.lowerPath.endsWith(".htm") ||
    entry.lowerPath.endsWith(".xhtml")
  );
}

export function chmKey(path: string): string {
  return path.replace(/^\/+/, "");
}

function relativeEncodedPath(fromKey: string, toKey: string): string {
  const fromParts = fromKey.split("/").slice(0, -1);
  const toParts = toKey.split("/");
  let common = 0;
  while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) {
    common += 1;
  }
  const ups = Array.from({ length: fromParts.length - common }, () => "..");
  const rest = toParts.slice(common);
  return [...ups, ...rest].map((part) => (part === ".." ? part : encodeURIComponent(part))).join("/");
}

function normalizeChmHtml(
  htmlText: string,
  entryPath: string,
  directory: ChmDirectory,
  selfChmNames: ReadonlySet<string>,
  unsupportedObjectLabel: string,
  items: Map<string, PublicationItem>,
): Uint8Array {
  const template = document.createElement("template");
  template.innerHTML = htmlText;
  const fromKey = chmKey(entryPath);

  for (const el of Array.from(template.content.querySelectorAll("object, embed, applet"))) {
    const notice = document.createElement("span");
    notice.textContent = `[${unsupportedObjectLabel}]`;
    el.replaceWith(notice);
  }

  for (const a of Array.from(template.content.querySelectorAll("a[href]"))) {
    const raw = a.getAttribute("href") ?? "";
    const resolved = resolveChmEntry(directory, entryPath, raw, selfChmNames);
    if (resolved && isHtmlEntry(resolved.entry)) {
      const rel = relativeEncodedPath(fromKey, chmKey(resolved.entry.path));
      const frag = resolved.fragment ? `#${encodeURIComponent(resolved.fragment)}` : "";
      a.setAttribute("href", `${rel}${frag}`);
    } else {
      a.removeAttribute("href");
    }
  }

  for (const img of Array.from(template.content.querySelectorAll("img[src]"))) {
    const raw = img.getAttribute("src") ?? "";
    if (/^(?:https?:|ftp:|javascript:|vbscript:)/i.test(raw.trim())) {
      img.removeAttribute("src");
      continue;
    }
    const resolved = resolveChmEntry(directory, entryPath, raw, selfChmNames);
    if (resolved) {
      img.setAttribute("src", relativeEncodedPath(fromKey, chmKey(resolved.entry.path)));
    } else {
      const cleanLocal = raw.trim();
      if (cleanLocal && !/^[a-z][\w+.-]*:/i.test(cleanLocal)) {
        const baseDir = entryPath.includes("/") ? entryPath.slice(0, entryPath.lastIndexOf("/") + 1) : "/";
        const missingKey = chmKey(normalizeChmPath(cleanLocal.startsWith("/") ? cleanLocal : baseDir + cleanLocal));
        const mime = chmMimeType(missingKey.toLowerCase());
        if (mime.startsWith("image/") && !items.has(missingKey)) {
          items.set(missingKey, { id: missingKey, path: missingKey, type: mime, properties: [] });
        }
        img.setAttribute("src", relativeEncodedPath(fromKey, missingKey));
      } else {
        img.removeAttribute("src");
      }
    }
  }

  for (const link of Array.from(template.content.querySelectorAll("link[href]"))) {
    if ((link.getAttribute("rel") ?? "").toLowerCase() !== "stylesheet") {
      link.removeAttribute("href");
      continue;
    }
    const raw = link.getAttribute("href") ?? "";
    const resolved = resolveChmEntry(directory, entryPath, raw, selfChmNames);
    if (resolved) {
      link.setAttribute("href", relativeEncodedPath(fromKey, chmKey(resolved.entry.path)));
    } else {
      link.removeAttribute("href");
    }
  }

  const wrapper = document.createElement("div");
  wrapper.append(template.content.cloneNode(true));
  return new TextEncoder().encode(wrapper.innerHTML);
}

export function createChmPublication(
  fileName: string,
  directory: ChmDirectory,
  metadata: ChmMetadata,
  reader: ChmSectionReader,
  locale: Locale,
): PublicationSource {
  const copy = chmCopy(locale);
  const selfChmNames = new Set<string>();
  const baseFileName = fileName.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
  if (baseFileName) selfChmNames.add(baseFileName);
  if (metadata.compiledName) {
    const compiled = metadata.compiledName.replace(/\\/g, "/").split("/").pop()?.toLowerCase();
    if (compiled) {
      selfChmNames.add(compiled);
      if (!compiled.endsWith(".chm")) selfChmNames.add(`${compiled}.chm`);
    }
  }

  const entriesByKey = new Map<string, ChmEntry>();
  const bookEntries = new Map<string, BookEntry>();
  const items = new Map<string, PublicationItem>();

  for (const entry of directory.entries) {
    if (entry.path.startsWith("::") || entry.path.endsWith("/")) continue;
    const key = chmKey(entry.path);
    if (!key || entriesByKey.has(key)) continue;
    entriesByKey.set(key, entry);
    bookEntries.set(key, {
      filename: key,
      directory: false,
      uncompressedSize: entry.length,
    });
    items.set(key, {
      id: key,
      path: key,
      type: chmMimeType(entry.lowerPath),
      properties: [],
    });
  }

  const spineKeys: string[] = [];
  const seenSpine = new Set<string>();
  const pushTopicPath = (rawPath: string) => {
    if (!rawPath || spineKeys.length >= CHM_LIMITS.maxTopics) return;
    const key = chmKey(rawPath);
    const entry = entriesByKey.get(key);
    if (!entry || !isHtmlEntry(entry) || seenSpine.has(key)) return;
    seenSpine.add(key);
    spineKeys.push(key);
  };

  if (metadata.defaultTopic) pushTopicPath(metadata.defaultTopic);

  const walkTocPaths = (nodes: readonly ChmTocNode[]) => {
    for (const node of nodes) {
      if (node.path) pushTopicPath(node.path);
      if (node.children.length > 0) walkTocPaths(node.children);
    }
  };
  walkTocPaths(metadata.tocTree);

  for (const idx of metadata.indexEntries) pushTopicPath(idx.path);
  for (const topic of metadata.systemTopics) pushTopicPath(topic.url);
  for (const entry of directory.entries) {
    if (isHtmlEntry(entry)) pushTopicPath(entry.path);
  }

  if (spineKeys.length === 0) {
    throw new ViewerError("invalid-file", copy.noTopics);
  }

  const spine = spineKeys.map((key) => items.get(key)!);

  const toc: TocItem[] = [];
  const flattenToc = (nodes: readonly ChmTocNode[], depth: number) => {
    for (const node of nodes) {
      const key = node.path ? chmKey(node.path) : "";
      if (key && seenSpine.has(key)) {
        const prefix = depth > 0 ? `${"— ".repeat(Math.min(depth, 4))}` : "";
        toc.push({ label: `${prefix}${node.label}`, path: key, fragment: node.fragment });
      }
      if (node.children.length > 0) flattenToc(node.children, depth + 1);
    }
  };
  flattenToc(metadata.tocTree, 0);

  if (toc.length === 0) {
    const titleByKey = new Map<string, string>();
    for (const item of metadata.systemTopics) {
      if (item.title) titleByKey.set(chmKey(item.url), item.title);
    }
    for (const key of spineKeys) {
      toc.push({
        label: titleByKey.get(key) || key.split("/").pop() || key,
        path: key,
        fragment: "",
      });
    }
  }

  const mapTree = (nodes: readonly ChmTocNode[]): TocTreeNode[] =>
    nodes
      .map((node): TocTreeNode | null => {
        const key = node.path ? chmKey(node.path) : "";
        const validPath = key && seenSpine.has(key) ? key : "";
        const children = mapTree(node.children);
        if (!validPath && children.length === 0) return null;
        return {
          label: node.label,
          path: validPath,
          fragment: node.fragment,
          children,
        };
      })
      .filter((node): node is TocTreeNode => node !== null);

  const tocTree = mapTree(metadata.tocTree);
  const index = metadata.indexEntries
    .map((item) => ({
      label: item.label,
      path: chmKey(item.path),
      fragment: item.fragment,
    }))
    .filter((item) => seenSpine.has(item.path));

  const source: BookSource = {
    entries: bookEntries,
    async read(key, limit, signal = new AbortController().signal) {
      const entry = entriesByKey.get(key);
      if (!entry) throw new ViewerError("missing-related-file", copy.missing);
      const rawBytes = await reader.readEntry(entry, limit, signal);
      const mime = chmMimeType(entry.lowerPath);
      if (mime === "text/html") {
        const text = decodeChmText(rawBytes, metadata.encoding, true);
        return normalizeChmHtml(text, entry.path, directory, selfChmNames, copy.unsupportedObject, items);
      }
      if (mime === "text/css") {
        const text = decodeChmText(rawBytes, metadata.encoding, false);
        return new TextEncoder().encode(text);
      }
      return rawBytes;
    },
    async dispose() {
      reader.dispose();
    },
  };

  const book: Publication = {
    title: metadata.title || fileName,
    author: "",
    direction: "ltr",
    items,
    spine,
    toc,
  };

  return {
    title: book.title,
    author: book.author,
    spine,
    toc,
    tocTree: tocTree.length > 0 ? tocTree : undefined,
    index: index.length > 0 ? index : undefined,
    loadSection: (path, signal) => prepareChapter(source, book, path, signal),
  };
}
