import type { PagedTextLayer, PagedTextWord } from "@anyfile/viewer-rendering/paged";

import { IDENTITY, applyMatrix, multiply, type Matrix } from "./geometry";
import type { Glyph, OfdNode, OfdPage } from "./model";

const MAX_WORDS = 20_000;

function localMatrix(node: OfdNode): Matrix {
  const offset: Matrix = [1, 0, 0, 1, node.offset?.[0] ?? 0, node.offset?.[1] ?? 0];
  return node.ctm ? multiply(node.ctm, offset) : offset;
}

/** Splits a text object's glyphs into baseline runs (multi-line objects use DeltaY). */
function lines(glyphs: readonly Glyph[]) {
  const out: Glyph[][] = [];
  for (const glyph of glyphs) {
    const last = out.at(-1);
    if (last && Math.abs(last.at(-1)!.y - glyph.y) < 1e-6) last.push(glyph);
    else out.push([glyph]);
  }
  return out;
}

/** Selectable text boxes in page fractions (`scale: 1`), one per baseline run of a TextObject. */
export function extractPageText(page: OfdPage): PagedTextLayer | null {
  const words: PagedTextWord[] = [];
  const visit = (node: OfdNode, parent: Matrix) => {
    if (words.length >= MAX_WORDS) return;
    const matrix = multiply(localMatrix(node), parent);
    if (node.kind === "group") {
      for (const child of node.children) visit(child, matrix);
      return;
    }
    if (node.kind !== "text") return;
    for (const run of lines(node.glyphs)) {
      const text = run.map((glyph) => glyph.text).join("");
      if (!text.trim() || words.length >= MAX_WORDS) continue;
      const left = run[0]!.x;
      const right = run.at(-1)!.x + node.size * node.hScale * (/[^\x00-\x7f]/.test(run.at(-1)!.text) ? 1 : 0.5);
      const y = run[0]!.y;
      const corners = [
        applyMatrix(matrix, left, y - node.size * 0.85),
        applyMatrix(matrix, right, y - node.size * 0.85),
        applyMatrix(matrix, left, y + node.size * 0.15),
        applyMatrix(matrix, right, y + node.size * 0.15),
      ];
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, cy]) => cy);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      words.push({
        x: x0 / page.width,
        y: y0 / page.height,
        w: (Math.max(...xs) - x0) / page.width,
        h: (Math.max(...ys) - y0) / page.height,
        text,
      });
    }
  };
  visit(page.root, IDENTITY);
  return words.length ? { scale: 1, words } : null;
}
