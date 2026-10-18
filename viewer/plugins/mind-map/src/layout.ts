import type { Topic, Sheet } from "./model";
export interface Box { topic: Topic; x: number; y: number; width: number; height: number; lines: string[]; font: number; parent?: Box; side: number }
export interface MapLayout { boxes: Box[]; width: number; height: number }
const GAP = 64, SPACE = 24;
export function layoutMap(sheet: Sheet, collapsed: Set<Topic>, measure: (text: string, font: number, bold: boolean) => number): MapLayout {
  const vertical = /tree|org-chart/.test(sheet.root.structure);
  const sizes = new Map<Topic, { width: number; height: number; lines: string[]; font: number; span: number }>();
  const attached = (t: Topic) => collapsed.has(t) ? [] : t.children.filter(c => c.kind === "attached");
  function size(t: Topic, depth: number) {
    const font = Math.max(10, Math.min(40, t.style.fontSize ? t.style.fontSize * 4 / 3 : depth === 0 ? 22 : 15));
    const lines: string[] = [];
    for (const paragraph of t.title.split("\n")) {
      let line = "";
      for (const character of paragraph) {
        if (line && measure(line + character, font, !!t.style.bold) > 260) { lines.push(line); line = ""; }
        line += character;
      }
      lines.push(line);
    }
    const image = !!t.image && !!sheet.assets?.has(t.image);
    const width = Math.max(70, ...lines.map(l => measure(l, font, !!t.style.bold) + 32), image ? Math.min(240, t.imageWidth || 160) + 24 : 0);
    const height = Math.max(42, lines.length * font * 1.35 + 22) + (image ? Math.min(180, t.imageHeight || 100) + 10 : 0) + (t.markers.length || t.labels.length ? 24 : 0);
    t.children.forEach(c => size(c, depth + 1));
    const nodes = attached(t);
    const span = Math.max(vertical ? width : height, nodes.reduce((n, c) => n + sizes.get(c)!.span, 0) + Math.max(0, nodes.length - 1) * SPACE);
    sizes.set(t, { width: vertical ? height : width, height: vertical ? width : height, lines, font, span });
  }
  size(sheet.root, 0);
  const boxes: Box[] = [];
  function place(t: Topic, x: number, y: number, side: number, parent?: Box, children = t.children): Box {
    const s = sizes.get(t)!;
    const box: Box = { topic: t, x, y, width: s.width, height: s.height, lines: s.lines, font: s.font, parent, side };
    boxes.push(box);
    const nodes = collapsed.has(t) ? [] : children.filter(c => c.kind === "attached");
    const span = nodes.reduce((n, c) => n + sizes.get(c)!.span, 0) + Math.max(0, nodes.length - 1) * SPACE;
    let top = y + s.height / 2 - span / 2;
    for (const c of nodes) {
      const cs = sizes.get(c)!;
      place(c, side > 0 ? x + s.width + GAP : x - GAP - cs.width, top + (cs.span - cs.height) / 2, side, box);
      top += cs.span + SPACE;
    }
    if (!collapsed.has(t)) {
      let floatingY = y + s.span / 2 + SPACE * 3;
      for (const c of children.filter(c => c.kind !== "attached")) {
        const cs = sizes.get(c)!;
        if (c.kind === "summary") {
          const range = t.boundaries.find(b => b.summaryId === c.id);
          const covered = range ? nodes.slice(range.start, range.end + 1) : [];
          const descendants = new Set<Topic>();
          const collect = (n: Topic) => { descendants.add(n); if (!collapsed.has(n)) n.children.forEach(collect); };
          covered.forEach(collect);
          const group = boxes.filter(b => descendants.has(b.topic));
          const right = Math.max(x + s.width + GAP, ...group.map(b => b.x + b.width));
          const left = Math.min(x - GAP, ...group.map(b => b.x));
          const top = Math.min(y, ...group.map(b => b.y)), bottom = Math.max(y + s.height, ...group.map(b => b.y + b.height));
          place(c, side > 0 ? right + GAP : left - GAP - cs.width, (top + bottom - cs.height) / 2, side);
        } else if (c.kind === "callout") {
          place(c, c.position?.x ?? x + s.width + 24, c.position?.y ?? y - cs.height - 28, side, box);
        } else {
          place(c, c.position?.x ?? x, c.position?.y ?? floatingY, c.position && c.position.x < 0 ? -1 : 1);
          floatingY += cs.span + SPACE * 3;
        }
      }
    }
    return box;
  }
  const root = sheet.root, s = sizes.get(root)!;
  const branches = attached(root);
  // Partition first-level branches without changing the file's order or descendants.
  const structure = root.structure.toLowerCase();
  const oneSided = /logic|tree|org-chart/.test(structure);
  const originalChildren = root.children;
  const left = branches.filter((t, i) => t.direction === "left" || (!t.direction && (structure.includes("left") || (!oneSided && i >= Math.ceil(branches.length / 2)))));
  const right = branches.filter(t => !left.includes(t));
  // place() is also used for the two root sides; emit the root and floating topics only once.
  const center = place(root, -s.width / 2, -s.height / 2, 1, undefined, [...right, ...originalChildren.filter(t => t.kind !== "attached")]);
  const leftStart = boxes.length;
  place(root, -s.width / 2, -s.height / 2, -1, undefined, left);
  boxes.splice(leftStart, 1);
  for (const b of boxes) if (b.parent?.topic === root) b.parent = center;
  if (/tree|org-chart/.test(structure)) {
    const up = structure.includes("up");
    for (const b of boxes) { const x = b.x, width = b.width; b.x = b.y; b.y = up ? -x-width : x; b.width = b.height; b.height = width; }
  }
  const minX = Math.min(...boxes.map(b => b.x)) - 60, minY = Math.min(...boxes.map(b => b.y)) - 60;
  const maxX = Math.max(...boxes.map(b => b.x + b.width)) + 60, maxY = Math.max(...boxes.map(b => b.y + b.height)) + 60;
  boxes.forEach(b => { b.x -= minX; b.y -= minY; });
  return { boxes, width: maxX - minX, height: maxY - minY };
}
