import { ViewerError } from "@anyfile/viewer-protocol";
import type { BookEntry, BookSource } from "@anyfile/archive-metadata-viewer/book-source";
import { elements, localReference, parseXml, type Publication } from "@anyfile/rendering-publication/markup";
import { prepareChapter } from "@anyfile/rendering-publication/safe-content";
export interface MobiResult { entries: (BookEntry & { type: string })[]; title: string; heapBytes: number; palm: boolean; }
export async function mobiPublication(source: BookSource, result: MobiResult, signal: AbortSignal) {
  const items: Publication["items"] = new Map(result.entries.map(entry => [entry.filename, { id: entry.filename, path: entry.filename, type: entry.filename.endsWith(".html") ? result.palm ? "text/plain" : "text/html" : entry.type, properties: [] }]));
  const spine = [...items.values()].filter(item => /^part\d+\.html$/.test(item.path));
  if (!spine.length || spine.length > 2000) throw new ViewerError("invalid-file", "Missing MOBI reading order.");
  const book: Publication = { title: result.title, author: "", direction: "ltr", items, spine, toc: [] };
  for (const item of items.values()) {
    if (item.type === "application/oebps-package+xml") {
      const opf = parseXml(await source.read(item.path, 2 * 1024 ** 2, signal));
      book.author = elements(opf, "creator").map(node => node.textContent ?? "").join(", ");
      book.title = elements(opf, "title")[0]?.textContent || book.title;
      if (elements(opf, "spine")[0]?.getAttribute("page-progression-direction") === "rtl") book.direction = "rtl";
    }
    if (item.type === "application/x-dtbncx+xml") {
      const ncx = parseXml(await source.read(item.path, 2 * 1024 ** 2, signal));
      for (const point of elements(ncx, "navPoint")) {
        const ref = localReference(item.path, elements(point, "content")[0]?.getAttribute("src") ?? "");
        if (ref && spine.some(section => section.path === ref.path)) book.toc.push({ ...ref, label: elements(point, "text")[0]?.textContent || String(book.toc.length + 1) });
      }
    }
  }
  if (!book.toc.length) book.toc = spine.map((item, index) => ({ path: item.path, fragment: "", label: String(index + 1) }));
  return { ...book, loadSection: (path: string, readSignal: AbortSignal) => prepareChapter(source, book, path, readSignal) };
}
