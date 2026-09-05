import { ViewerError } from "@anyfile/viewer-protocol";
import { CONTENT_CSP, type SafeChapter } from "@anyfile/rendering-publication";
import { inspectImageFile } from "@anyfile/browser-image-viewer/decode";
import { FB2_LIMITS, type Fb2Book } from "./publication";
import { FB2_NAMESPACE } from "./encoding";
const TAGS: Record<string, string> = { section: "section", title: "h2", subtitle: "h3", p: "p", poem: "blockquote", stanza: "div", v: "div", cite: "blockquote", epigraph: "blockquote", "text-author": "p", date: "p", table: "table", tr: "tr", th: "th", td: "td", a: "a", image: "img", strong: "strong", emphasis: "em", strikethrough: "s", sub: "sub", sup: "sup", code: "code", "empty-line": "br", coverpage: "div" };
export function fb2Href(node: Element) {
  return node.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? node.getAttribute("href") ?? "";
}
export async function prepareFb2Section(book: Fb2Book, path: string, signal: AbortSignal): Promise<SafeChapter> {
  const target = document.implementation.createHTMLDocument("");
  const urls = new Map<string, string>();
  const links: SafeChapter["links"] = [];
  let missingResources = 0, bytesTotal = 0, pixels = 0, nodes = 0, textBytes = 0;
  const dispose = () => { for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); };
  async function image(id: string): Promise<string | null> {
    if (urls.has(id)) return urls.get(id)!;
    const binary = book.binaries.get(id);
    if (!binary) { missingResources++; return null; }
    const type = binary.getAttribute("content-type") ?? "";
    if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(type)) { missingResources++; return null; }
    const encoded = (binary.textContent ?? "").replace(/\s/g, "");
    if (encoded.length > Math.ceil(FB2_LIMITS.image / 3) * 4 || urls.size >= FB2_LIMITS.resources)
      throw new ViewerError("resource-limit", "FB2 image limit exceeded.");
    if (encoded.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(encoded.replace(/={1,2}$/, "")))
      throw new ViewerError("invalid-file", "Invalid FB2 base64.");
    bytesTotal += encoded.length / 4 * 3;
    if (bytesTotal > FB2_LIMITS.resourceBytes) throw new ViewerError("resource-limit", "FB2 resource bytes exceeded.");
    const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const info = inspectImageFile(bytes);
    if (!info?.width || !info.height) throw new ViewerError("invalid-file", "Invalid FB2 image.");
    if (info.animated && !info.frameCount) throw new ViewerError("resource-limit", "Unbounded FB2 animation.");
    pixels += info.width * info.height * (info.frameCount ?? 1);
    if (pixels > FB2_LIMITS.pixels) throw new ViewerError("resource-limit", "FB2 image pixels exceeded.");
    signal.throwIfAborted();
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    urls.set(id, url);
    return url;
  }
  async function copy(node: Node, parent: Node) {
    signal.throwIfAborted();
    if (++nodes > FB2_LIMITS.chapterNodes) throw new ViewerError("resource-limit", "FB2 chapter nodes exceeded.");
    // Yield to cancellation during long mapping without introducing a persistent task.
    if (nodes % 256 === 0) { await new Promise<void>((resolve) => setTimeout(resolve, 0)); signal.throwIfAborted(); }
    if (node.nodeType === 3) {
      const value = node.textContent ?? "";
      textBytes += new TextEncoder().encode(value).length;
      if (textBytes > FB2_LIMITS.chapter) throw new ViewerError("resource-limit", "FB2 chapter bytes exceeded.");
      parent.appendChild(target.createTextNode(value)); return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    const tag = TAGS[element.localName];
    if (!tag || element.namespaceURI !== FB2_NAMESPACE) return;
    const result = target.createElement(tag);
    if (element.id) result.id = element.id;
    if (tag === "td" || tag === "th") for (const attr of ["colspan", "rowspan"]) {
      const value = element.getAttribute(attr);
      if (value && /^[1-9]\d?$/.test(value)) result.setAttribute(attr, value);
    }
    const href = fb2Href(element);
    if (tag === "a" && href.startsWith("#")) {
      const fragment = href.slice(1), destination = book.anchors.get(fragment);
      if (destination) { result.setAttribute("href", "#"); result.dataset.bookLink = String(links.length); links.push({ path: destination, fragment }); }
    }
    if (tag === "img") {
      const url = href.startsWith("#") ? await image(href.slice(1)) : null;
      if (url) result.setAttribute("src", url);
      result.setAttribute("alt", element.getAttribute("alt") ?? "");
    } else for (const child of Array.from(node.childNodes)) await copy(child, result);
    parent.appendChild(result);
  }
  try {
    const section = book.sections.get(path);
    if (!section) throw new ViewerError("missing-related-file", "Missing FB2 section.");
    for (const node of section) await copy(node, target.body);
    const csp = target.createElement("meta"); csp.httpEquiv = "Content-Security-Policy"; csp.content = CONTENT_CSP;
    const style = target.createElement("style"); style.id = "book-reader-style";
    target.head.append(csp, style);
    signal.throwIfAborted();
    const html = "<!doctype html>" + target.documentElement.outerHTML;
    if (new TextEncoder().encode(html).length > FB2_LIMITS.chapter) throw new ViewerError("resource-limit", "FB2 mapped chapter bytes exceeded.");
    return { html, links, missingResources, dispose };
  } catch (error) { dispose(); throw error; }
}
