import { parseXmlDocument } from "@anyfile/runtime-assets/xml";

/**
 * Email HTML sanitizer. Message bodies are rendered in a script-less sandboxed
 * iframe under a CSP that only allows inline styles and local blob/data images;
 * this pass additionally drops active content and every remote reference so no
 * tracking pixel, stylesheet or link is ever fetched.
 */
const TAGS = new Set(
  ("html head body title meta p div span section article aside header footer main center font h1 h2 h3 h4 h5 h6 " +
    "ol ul li dl dt dd blockquote pre code tt kbd samp em strong b i u s strike del ins small big sub sup br hr a img " +
    "figure figcaption table caption colgroup col thead tbody tfoot tr th td abbr address cite q mark wbr nobr style").split(" "),
);
const DROP_WITH_CONTENT = new Set(["script", "iframe", "frame", "frameset", "object", "embed", "applet", "form", "noscript", "template", "svg", "math", "link", "base", "audio", "video", "source", "track", "canvas"]);
const ATTRS = new Set(
  ("align valign width height colspan rowspan cellpadding cellspacing border bgcolor color face size dir lang " +
    "title alt style class id start type span nowrap").split(" "),
);
const SAFE_IMAGE = /^(?:data:image\/(?:png|jpeg|gif|webp|bmp);|blob:)/i;
const CSS_URL = /url\s*\(|@import|expression\s*\(|behavior\s*:|-moz-binding/i;

export const EMAIL_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src blob: data:; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";

export interface SanitizedEmail {
  readonly html: string;
  readonly blockedRemote: number;
}

/**
 * @param resolveCid maps `cid:` references of inline attachments to local blob URLs.
 */
export function sanitizeEmailHtml(source: string, resolveCid: (cid: string) => string | undefined): SanitizedEmail {
  const doc = parseXmlDocument(source, "text/html");
  let blockedRemote = 0;
  const walk = (parent: Element) => {
    for (const child of Array.from(parent.children)) {
      const tag = child.localName;
      if (DROP_WITH_CONTENT.has(tag)) {
        child.remove();
        continue;
      }
      if (!TAGS.has(tag)) {
        walk(child);
        child.replaceWith(...Array.from(child.childNodes));
        continue;
      }
      if (tag === "meta") {
        child.remove();
        continue;
      }
      if (tag === "style") {
        if (CSS_URL.test(child.textContent ?? "")) {
          blockedRemote++;
          child.textContent = (child.textContent ?? "").replace(/url\s*\([^)]*\)/gi, "none").replace(/@import[^;]*;?/gi, "");
        }
        continue;
      }
      const href = tag === "a" ? child.getAttribute("href") : null;
      const src = tag === "img" ? child.getAttribute("src") ?? "" : "";
      for (const attr of Array.from(child.attributes)) {
        if (!ATTRS.has(attr.name.toLowerCase())) child.removeAttribute(attr.name);
        else if (attr.name.toLowerCase() === "style" && CSS_URL.test(attr.value)) {
          blockedRemote++;
          child.removeAttribute(attr.name);
        }
      }
      if (href) child.setAttribute("title", href);
      if (tag === "img") {
        const local = /^cid:/i.test(src) ? resolveCid(src.slice(4)) : SAFE_IMAGE.test(src) ? src : undefined;
        if (local) child.setAttribute("src", local);
        else if (src) blockedRemote++;
      }
      walk(child);
    }
  };
  walk(doc.documentElement);
  const head = doc.head ?? doc.documentElement.insertBefore(doc.createElement("head"), doc.body);
  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", EMAIL_CSP);
  head.prepend(meta);
  const style = doc.createElement("style");
  style.textContent = "html{color-scheme:light}body{margin:12px;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}";
  head.append(style);
  return { html: `<!doctype html>${doc.documentElement.outerHTML}`, blockedRemote };
}
