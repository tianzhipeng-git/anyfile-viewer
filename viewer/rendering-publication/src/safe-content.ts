import { ViewerError } from "@anyfile/viewer-protocol";
import { checkBookAbort, type BookSource } from "@anyfile/archive-metadata-viewer/book-source";
import { inspectImageFile } from "@anyfile/browser-image-viewer/decode";
import { MARKUP_LIMITS as EPUB_LIMITS, elements, localReference, parseXml, type Publication } from "./markup";

const TAGS = new Set(
  "html head body title p div span section article aside header footer main nav h1 h2 h3 h4 h5 h6 ol ul li dl dt dd blockquote pre code em strong b i u s small sub sup br hr a img figure figcaption table caption colgroup col thead tbody tfoot tr th td ruby rt rp bdi bdo".split(
    " ",
  ),
);
const ATTRS = new Set("id class title lang dir alt width height colspan rowspan scope".split(" "));
const CSS_PROPERTIES =
  /^(?:color|background-color|font(?:-family|-size|-style|-weight|-variant)?|line-height|text-align|text-indent|text-decoration|white-space|word-break|overflow-wrap|vertical-align|margin(?:-top|-bottom|-left|-right)?|padding(?:-top|-bottom|-left|-right)?|border(?:-width|-style|-color|-collapse|-spacing)?|list-style-type|display|width|max-width|height|max-height|direction|writing-mode|ruby-position)$/;
const FONT_TYPES = new Set([
  "font/woff",
  "font/woff2",
  "font/ttf",
  "font/otf",
  "application/font-woff",
  "application/vnd.ms-opentype",
  "application/x-font-ttf",
  "application/x-font-opentype",
]);
import { CONTENT_CSP, type SafeChapter } from "./types";
export async function prepareChapter(
  zip: BookSource,
  book: Publication,
  path: string,
  signal: AbortSignal,
): Promise<SafeChapter> {
  const urls = new Map<string, string>();
  const links: { path: string; fragment: string }[] = [];
  let resourceBytes = 0,
    fonts = 0,
    pixels = 0,
    cssBytes = 0,
    missingResources = 0;
  const dispose = () => {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  };
  async function resource(base: string, value: string, font = false): Promise<string | null> {
    const ref = localReference(base, value);
    if (!ref) return null;
    if (urls.has(ref.path)) return urls.get(ref.path)!;
    const item = book.items.get(ref.path);
    if (
      !item ||
      !(font
        ? FONT_TYPES.has(item.type)
        : /^image\/(?:jpeg|png|gif|webp|avif|svg\+xml)$/.test(item.type))
    )
      return null;
    if (!zip.entries.has(ref.path)) {
      missingResources++;
      return null;
    }
    if (urls.size >= EPUB_LIMITS.resources || (font && ++fonts > EPUB_LIMITS.fonts))
      throw new ViewerError("resource-limit", "Chapter resource count exceeded.");
    const bytes = await zip.read(ref.path, font ? EPUB_LIMITS.font : 16 * 1024 * 1024, signal);
    resourceBytes += bytes.length;
    if (resourceBytes > EPUB_LIMITS.resourceBytes)
      throw new ViewerError("resource-limit", "Chapter resource bytes exceeded.");
    let blob: Blob;
    if (item.type === "image/svg+xml") {
      const svg = parseXml(bytes);
      const svgWidth = Number(svg.documentElement.getAttribute("width") ?? 300),
        svgHeight = Number(svg.documentElement.getAttribute("height") ?? 150);
      if (!Number.isFinite(svgWidth * svgHeight) || svgWidth <= 0 || svgHeight <= 0)
        throw new ViewerError("invalid-file", "Invalid SVG dimensions.");
      pixels += svgWidth * svgHeight;
      if (pixels > 16_000_000)
        throw new ViewerError("resource-limit", "Chapter image pixels exceeded.");
      // SVG is rasterized by <img>; still strip active/foreign content and all references.
      const allowed = new Set(
        "svg g path rect circle ellipse line polyline polygon text tspan defs linearGradient radialGradient stop clipPath title desc".split(
          " ",
        ),
      );
      for (const node of [
        svg.documentElement,
        ...Array.from(svg.documentElement.querySelectorAll("*")),
      ]) {
        if (!allowed.has(node.localName)) {
          node.remove();
          continue;
        }
        for (const attr of Array.from(node.attributes))
          if (
            !/^(?:xmlns|viewBox|width|height|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|d|points|fill|stroke|stroke-width|transform|offset|stop-color|font-size|text-anchor)$/.test(
              attr.name,
            ) ||
            /url\s*\(|[\\<>]/i.test(attr.value)
          )
            node.removeAttributeNode(attr);
      }
      if (svg.documentElement.localName !== "svg")
        throw new ViewerError("invalid-file", "Invalid SVG image.");
      blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: item.type });
    } else {
      if (!font) {
        const info = inspectImageFile(bytes);
        if (!info?.width || !info.height)
          throw new ViewerError("invalid-file", "Invalid chapter image.");
        if (info.animated && !info.frameCount)
          throw new ViewerError("resource-limit", "Unbounded animation frames.");
        pixels += info.width * info.height * (info.frameCount ?? 1);
        if (pixels > 16_000_000)
          throw new ViewerError("resource-limit", "Chapter image pixels exceeded.");
      }
      blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: item.type });
    }
    checkBookAbort(signal);
    const url = URL.createObjectURL(blob);
    urls.set(ref.path, url);
    return url;
  }
  async function css(source: string, base: string): Promise<string> {
    cssBytes += source.length;
    if (cssBytes > 1024 * 1024 || source.length > 256 * 1024)
      throw new ViewerError("resource-limit", "CSS limit exceeded.");
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    if (sheet.cssRules.length > 2000)
      throw new ViewerError("resource-limit", "CSS rules exceeded.");
    let result = "";
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule.type === 5) {
        const style = (rule as CSSFontFaceRule).style;
        const family = style.getPropertyValue("font-family");
        const source = style.getPropertyValue("src");
        const match = /^url\(\s*["']?([^"')]+)["']?\s*\)(?:\s+format\(["'][\w-]+["']\))?$/.exec(
          source,
        );
        if (match && /^[\w\s"'-]+$/.test(family)) {
          const url = await resource(base, match[1], true);
          if (url) result += `@font-face{font-family:${family};src:url("${url}")}`;
        }
      } else if (rule.type === 1) {
        const styleRule = rule as CSSStyleRule;
        if (!/^[\w\s.#,:>+~*()[\]="'|-]+$/.test(styleRule.selectorText)) continue;
        const declarations: string[] = [];
        for (let i = 0; i < styleRule.style.length; i++) {
          const property = styleRule.style.item(i),
            value = styleRule.style.getPropertyValue(property);
          if (
            CSS_PROPERTIES.test(property) &&
            !/[\\<>@]|url\s*\(|expression|var\s*\(|image-set/i.test(value)
          )
            declarations.push(`${property}:${value}`);
        }
        result += `${styleRule.selectorText}{${declarations.join(";")}}`;
      }
    }
    return result;
  }
  try {
    const bytes = await zip.read(path, EPUB_LIMITS.chapter, signal);
    const isPlain = book.items.get(path)?.type === "text/plain";
    const isHtml = isPlain || book.items.get(path)?.type === "text/html";
    // Template contents are inert: parsing legacy MOBI HTML must not start resource requests.
    const template = isHtml ? document.createElement("template") : undefined;
    if (template) {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (isPlain) { const pre = document.createElement("pre"); pre.textContent = text; template.content.append(pre); }
      // HTML treats self-closing custom elements as containers. Normalize the
      // legacy empty page-break element before parsing so it cannot swallow later chapters.
      else template.innerHTML = text.replace(/<\/?mbp:pagebreak\b[^>]*>/gi, "<hr>");
    }
    const source = template?.content ?? parseXml(bytes);
    const stack: [Node, number][] = [[source, 0]];
    let nodes = 0;
    while (stack.length) {
      const [node, depth] = stack.pop()!;
      if (++nodes > EPUB_LIMITS.nodes || depth > EPUB_LIMITS.depth) throw new ViewerError("resource-limit", "Chapter structure limit exceeded.");
      for (const child of Array.from(node.childNodes)) stack.push([child, depth + 1]);
    }
    const target = document.implementation.createHTMLDocument("");
    let styles = "";
    for (const style of elements(source, "style"))
      styles += await css(style.textContent ?? "", path);
    for (const link of elements(source, "link")) {
      if (link.getAttribute("rel") !== "stylesheet") continue;
      const ref = localReference(path, link.getAttribute("href") ?? "");
      if (ref && book.items.get(ref.path)?.type === "text/css") {
        if (zip.entries.has(ref.path))
          styles += await css(
            new TextDecoder().decode(await zip.read(ref.path, 256 * 1024, signal)),
            ref.path,
          );
        else missingResources++;
      }
    }
    async function copy(node: Node, parent: Node) {
      checkBookAbort(signal);
      if (node.nodeType === 3) {
        parent.appendChild(target.createTextNode(node.textContent ?? ""));
        return;
      }
      if (node.nodeType !== 1) return;
      const element = node as Element,
        rawTag = element.localName.toLowerCase(),
        tag = rawTag === "font" ? "span" : rawTag === "center" ? "div" : rawTag;
      if (!TAGS.has(tag)) return;
      const result = target.createElement(tag);
      for (const attr of Array.from(element.attributes))
        if (ATTRS.has(attr.name)) result.setAttribute(attr.name, attr.value);
      if (element.hasAttribute("style"))
        result.setAttribute(
          "style",
          (await css(`p{${element.getAttribute("style")}}`, path)).replace(/^p\{|\}$/g, ""),
        );
      if (tag === "a") {
        const ref = localReference(path, element.getAttribute("href") ?? "");
        if (ref && book.spine.some((item) => item.path === ref.path)) {
          result.setAttribute("href", "#");
          result.dataset.bookLink = String(links.length);
          links.push(ref);
        }
      }
      if (tag === "img") {
        const url = await resource(path, element.getAttribute("src") ?? "");
        if (url) result.setAttribute("src", url);
      }
      for (const child of Array.from(node.childNodes)) await copy(child, result);
      parent.appendChild(result);
    }
    const body = elements(source, "body")[0] ?? (isHtml ? source : undefined);
    if (!body) throw new ViewerError("invalid-file", "Missing chapter body.");
    target.body.dir = ("getAttribute" in body ? body.getAttribute("dir") : null) === "rtl" ? "rtl" : book.direction;
    for (const child of Array.from(body.childNodes)) await copy(child, target.body);
    const csp = target.createElement("meta");
    csp.httpEquiv = "Content-Security-Policy";
    csp.content = CONTENT_CSP;
    target.head.append(csp);
    const style = target.createElement("style");
    style.textContent = styles;
    target.head.append(style);
    const userStyle = target.createElement("style");
    userStyle.id = "book-reader-style";
    target.head.append(userStyle);
    return {
      html: "<!doctype html>" + target.documentElement.outerHTML,
      links,
      missingResources,
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
