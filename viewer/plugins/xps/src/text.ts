import type { PagedTextLayer, PagedTextWord } from "@anyfile/viewer-rendering/paged";

import type { GlyphOutlineFont } from "./font";
import { IDENTITY, applyMatrix, multiply, type Matrix } from "./geometry";
import type { XpsNode, XpsPage } from "./model";

const MAX_WORDS = 20_000;

function runWidth(node: Extract<XpsNode, { kind: "glyphs" }>, font: GlyphOutlineFont | null | undefined) {
  let width = 0;
  for (const glyph of node.glyphs) {
    if (glyph.advance !== undefined) width += (glyph.advance * node.size) / 100;
    else if (font) {
      const id = glyph.index ?? (glyph.codePoint === undefined ? 0 : font.glyphIndex(glyph.codePoint));
      width += (font.advance(id) * node.size) / font.unitsPerEm;
    } else width += node.size * 0.5;
  }
  return width;
}

/**
 * Selectable text boxes, one per `Glyphs` run, in page fractions (`scale: 1`) as expected by
 * the shared paged text layer. Visual brushes are skipped (their text is decorative).
 */
export function extractPageText(page: XpsPage, fonts?: ReadonlyMap<string, GlyphOutlineFont | null>): PagedTextLayer | null {
  const words: PagedTextWord[] = [];
  const visit = (node: XpsNode, parent: Matrix) => {
    if (words.length >= MAX_WORDS) return;
    const matrix = node.transform ? multiply(node.transform, parent) : parent;
    if (node.kind === "canvas") {
      for (const child of node.children) visit(child, matrix);
      return;
    }
    if (node.kind !== "glyphs" || !node.text.trim()) return;
    const width = runWidth(node, fonts?.get(node.font));
    const left = node.rtl ? node.x - width : node.x;
    const top = node.y - node.size * 0.8;
    const corners = [
      applyMatrix(matrix, left, top),
      applyMatrix(matrix, left + width, top),
      applyMatrix(matrix, left, node.y + node.size * 0.2),
      applyMatrix(matrix, left + width, node.y + node.size * 0.2),
    ];
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    words.push({
      x: x / page.width,
      y: y / page.height,
      w: (Math.max(...xs) - x) / page.width,
      h: (Math.max(...ys) - y) / page.height,
      text: node.text,
    });
  };
  visit(page.root, IDENTITY);
  return words.length ? { scale: 1, words } : null;
}
