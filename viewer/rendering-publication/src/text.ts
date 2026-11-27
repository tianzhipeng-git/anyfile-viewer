import { parseXmlDocument } from "@anyfile/runtime-assets/xml";

/** Node-safe chapter → Markdown conversion shared by the e-book `./extract` entries (no browser globals). */

const SKIP = new Set("head script style noscript template svg math img image object embed applet iframe frame frameset form input select textarea button audio video canvas map".split(" "));
const BLOCK = new Set("html body p div section article aside header footer main nav address center figure figcaption caption table thead tbody tfoot dl dt dd ol ul blockquote".split(" "));
const MAX_DEPTH = 256;

export interface MarkupTextOptions {
  /** Maps source element local names to HTML equivalents (e.g. FB2 `title` → `h2`); unmapped names pass through. */
  readonly tagMap?: Readonly<Record<string, string>>;
  /** Added to every heading level (capped at 6), so chapter headings nest under a document heading. */
  readonly headingOffset?: number;
}

/** Parses an HTML document without executing scripts or loading resources. */
export function parseHtmlText(source: string): Document {
  return parseXmlDocument(source, "text/html");
}

/**
 * Converts an (X)HTML or mapped XML subtree into plain Markdown: headings, paragraphs, list items,
 * quotes, table rows and preformatted blocks keep their structure; images, scripts and styles are dropped.
 */
export function markupToMarkdown(roots: Node | readonly Node[], options: MarkupTextOptions = {}): string {
  const blocks: string[] = [];
  let line = "";
  let marker = "";
  let quote = 0;
  const push = (text: string) => blocks.push("> ".repeat(quote) + text);
  const flush = () => {
    const text = line.replace(/\s+/g, " ").trim();
    line = "";
    if (!text) return;
    push(marker + text);
    marker = "";
  };
  const tagOf = (element: Element) => options.tagMap?.[element.localName] ?? element.localName.toLowerCase();
  const inlineText = (node: Node): string => {
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue ?? "";
    if (node.nodeType !== 1) return "";
    const tag = tagOf(node as Element);
    if (SKIP.has(tag)) return "";
    const text = Array.from(node.childNodes, inlineText).join("");
    return BLOCK.has(tag) || tag === "br" ? ` ${text} ` : text;
  };

  function walk(node: Node, depth: number) {
    if (node.nodeType === 3 || node.nodeType === 4) {
      line += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType === 9 || node.nodeType === 11) {
      for (const child of Array.from(node.childNodes)) walk(child, depth + 1);
      return;
    }
    if (node.nodeType !== 1 || depth > MAX_DEPTH) return;
    const tag = tagOf(node as Element);
    if (SKIP.has(tag)) return;
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      flush();
      const level = Math.min(6, Number(heading[1]) + (options.headingOffset ?? 0));
      const text = inlineText(node).replace(/\s+/g, " ").trim();
      if (text) push(`${"#".repeat(level)} ${text}`);
      return;
    }
    if (tag === "br") return flush();
    if (tag === "hr") {
      flush();
      push("---");
      return;
    }
    if (tag === "pre") {
      flush();
      const text = (node.textContent ?? "").replace(/^\n+|\s+$/g, "");
      if (text) push("```\n" + text + "\n```");
      return;
    }
    if (tag === "tr") {
      flush();
      const cells = Array.from((node as Element).children)
        .filter((cell) => ["td", "th"].includes(tagOf(cell)))
        .map((cell) => inlineText(cell).replace(/\s+/g, " ").trim().replaceAll("|", "\\|"));
      if (cells.some(Boolean)) push(`| ${cells.join(" | ")} |`);
      return;
    }
    if (tag === "li") {
      flush();
      marker = "- ";
    } else if (BLOCK.has(tag)) flush();
    if (tag === "blockquote") quote += 1;
    for (const child of Array.from(node.childNodes)) walk(child, depth + 1);
    if (tag === "li" || BLOCK.has(tag)) flush();
    if (tag === "blockquote") quote -= 1;
    if (tag === "li") marker = "";
  }

  for (const root of Array.isArray(roots) ? roots : [roots as Node]) {
    walk(root, 0);
    flush();
  }
  return blocks.join("\n\n");
}
