import { ViewerError } from "@anyfile/viewer-protocol";
import type { PublicationSource } from "@anyfile/rendering-publication";
import { decodeFb2, FB2_NAMESPACE } from "./encoding";
import { prepareFb2Section } from "./safe-content";
export const FB2_LIMITS = { file: 32 * 1024 * 1024, nodes: 100_000, depth: 64, chapters: 2000, chapter: 2 * 1024 * 1024, chapterNodes: 20_000, image: 8 * 1024 * 1024, resources: 32, resourceBytes: 16 * 1024 * 1024, pixels: 16_000_000 };
export interface Fb2Book extends PublicationSource {
  sections: Map<string, Element[]>;
  anchors: Map<string, string>;
  binaries: Map<string, Element>;
}
export function children(node: Element, name: string) {
  return Array.from(node.children).filter((child) => child.localName === name && child.namespaceURI === FB2_NAMESPACE);
}
export function parseFictionBook(bytes: Uint8Array, signal: AbortSignal): Fb2Book {
  signal.throwIfAborted();
  if (bytes.length > FB2_LIMITS.file) throw new ViewerError("resource-limit", "FB2 file limit exceeded.");
  const source = decodeFb2(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new ViewerError("invalid-file", "FB2 DTD and entities are disabled.");
  const doc = new DOMParser().parseFromString(source, "application/xml");
  const root = doc.documentElement;
  if (doc.querySelector("parsererror") || root.localName !== "FictionBook" || root.namespaceURI !== FB2_NAMESPACE)
    throw new ViewerError("invalid-file", "Invalid FictionBook XML.");
  const stack: [Element, number][] = [[root, 1]];
  const ids = new Set<string>();
  let count = 0;
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    count += node.childNodes.length + 1;
    if (depth > FB2_LIMITS.depth || count > FB2_LIMITS.nodes) throw new ViewerError("resource-limit", "FB2 structure limit exceeded.");
    const id = node.getAttribute("id");
    if (id) {
      if (ids.has(id)) throw new ViewerError("invalid-file", "Duplicate FictionBook ID.");
      ids.add(id);
    }
    if (node.localName === "binary" && (node.textContent?.length ?? 0) > Math.ceil(FB2_LIMITS.image / 3) * 4 + 65536)
      throw new ViewerError("resource-limit", "FB2 binary limit exceeded.");
    for (const child of Array.from(node.children)) stack.push([child, depth + 1]);
  }
  let generatedId = 0;
  for (const section of Array.from(root.querySelectorAll("*"))) {
    if (section.namespaceURI !== FB2_NAMESPACE || section.localName !== "section" || section.id) continue;
    let id: string;
    do { id = `fb2-section-${generatedId++}`; } while (ids.has(id));
    section.id = id;
    ids.add(id);
  }
  const description = children(root, "description")[0];
  const info = description && children(description, "title-info")[0];
  const text = (name: string) => info ? children(info, name)[0]?.textContent?.trim() ?? "" : "";
  const book: Fb2Book = {
    title: text("book-title"), author: info ? children(info, "author").map((author) => Array.from(author.children).filter((node) => ["first-name", "middle-name", "last-name", "nickname"].includes(node.localName)).map((node) => node.textContent).join(" ")).join(", ") : "",
    spine: [], toc: [], sections: new Map(), anchors: new Map(), binaries: new Map(),
    loadSection: (path, sectionSignal) => prepareFb2Section(book, path, sectionSignal),
  };
  for (const binary of children(root, "binary")) {
    const id = binary.getAttribute("id");
    if (id) book.binaries.set(id, binary);
  }
  function add(nodes: Element[], label: string) {
    if (!nodes.length) return;
    const path = `section-${book.spine.length}`;
    book.spine.push({ id: label || path, path });
    book.sections.set(path, nodes);
    book.toc.push({ path, fragment: "", label: label || path });
    for (const node of nodes) for (const element of [node, ...Array.from(node.querySelectorAll("*"))]) {
      const id = element.getAttribute("id");
      if (id) book.anchors.set(id, path);
      if (element !== node && element.localName === "section" && id) {
        const title = children(element, "title")[0]?.textContent?.trim();
        if (title) book.toc.push({ path, fragment: id, label: title });
      }
    }
  }
  const cover = info && children(info, "coverpage")[0];
  const bodies = children(root, "body");
  if (!bodies.length) throw new ViewerError("invalid-file", "Missing FictionBook body.");
  for (const body of bodies) {
    let preamble: Element[] = [];
    for (const node of Array.from(body.children)) {
      if (node.localName === "section") {
        add(preamble, book.title); preamble = [];
        add([node], children(node, "title")[0]?.textContent?.trim() ?? node.id);
      } else preamble.push(node);
    }
    add(preamble, body.getAttribute("name") ?? book.title);
  }
  if (!book.spine.length) throw new ViewerError("invalid-file", "Empty FictionBook body.");
  if (book.spine.length > FB2_LIMITS.chapters || book.toc.length > FB2_LIMITS.chapters)
    throw new ViewerError("resource-limit", "FB2 chapter limit exceeded.");
  if (cover) book.sections.get(book.spine[0].path)!.unshift(cover);
  signal.throwIfAborted();
  return book;
}
