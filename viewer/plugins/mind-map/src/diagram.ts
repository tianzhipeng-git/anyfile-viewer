import type { MapLayout, Box } from "./layout";
import type { Sheet, Topic } from "./model";
import type { MindMapCopy } from "./messages";
const NS = "http://www.w3.org/2000/svg";
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number> = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attributes)) e.setAttribute(k, String(v));
  return e;
}
function label(text: string, x: number, y: number, size = 13) {
  const e = svg("text", { x, y, "font-size": size, fill: "#334155" }); e.textContent = text; return e;
}
function contrast(fill: string | undefined) {
  if (!fill || !/^#[\da-f]{6}$/i.test(fill)) return "#172033";
  const rgb = [1, 3, 5].map(i => parseInt(fill.slice(i, i + 2), 16));
  return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 < 145 ? "#ffffff" : "#172033";
}
export function drawDiagram(layout: MapLayout, sheet: Sheet, urls: Map<string, string>, collapsed: Set<Topic>, copy: MindMapCopy, select: (t: Topic) => void, toggle: (t: Topic) => void) {
  const group = svg("g");
  const edges = svg("g", { fill: "none", "stroke-width": 2 });
  const nodes = svg("g");
  const byId = new Map(layout.boxes.map(b => [b.topic.id, b]));
  const byTopic = new Map(layout.boxes.map(b => [b.topic, b]));
  group.append(edges, nodes);
  const path = (d: string, stroke: string, dashed = false) => {
    const p = svg("path", { d, stroke }); if (dashed) p.setAttribute("stroke-dasharray", "7 5"); edges.append(p); return p;
  };
  function connect(a: Box, b: Box, relationship = false, title = "") {
    const vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x) && /tree|org-chart/.test(sheet.root.structure);
    const x1 = vertical ? a.x + a.width / 2 : a.x + (b.x > a.x ? a.width : 0);
    const y1 = vertical ? a.y + (b.y > a.y ? a.height : 0) : a.y + a.height / 2;
    const x2 = vertical ? b.x + b.width / 2 : b.x + (b.x > a.x ? 0 : b.width);
    const y2 = vertical ? b.y + (b.y > a.y ? 0 : b.height) : b.y + b.height / 2;
    const bend = relationship ? 60 : 0;
    const d = vertical ? `M${x1},${y1} C${x1},${(y1+y2)/2} ${x2},${(y1+y2)/2} ${x2},${y2}` : `M${x1},${y1} C${(x1+x2)/2},${y1-bend} ${(x1+x2)/2},${y2-bend} ${x2},${y2}`;
    const p = path(d, relationship ? "#a855a0" : b.topic.style.stroke || "#7b8fab", relationship || b.topic.kind === "callout");
    p.setAttribute("class", relationship ? "mm-relationship" : "mm-branch");
    if (relationship) {
      const angle = Math.atan2(y2 - (y2 - bend), x2 - (x1 + x2) / 2);
      path(`M${x2-10*Math.cos(angle-.45)},${y2-10*Math.sin(angle-.45)} L${x2},${y2} L${x2-10*Math.cos(angle+.45)},${y2-10*Math.sin(angle+.45)}`, "#a855a0");
    }
    if (title) edges.append(label(title, (x1+x2)/2, (y1+y2)/2 - 16));
  }
  for (const b of layout.boxes) {
    if (b.parent) connect(b.parent, b);
    for (const boundary of b.topic.boundaries) {
      const children = b.topic.children.filter(t => t.kind === "attached").slice(boundary.start, boundary.end + 1);
      const covered: Box[] = [];
      const visit = (t: Topic) => { const box = byTopic.get(t); if (box) { covered.push(box); t.children.forEach(visit); } };
      children.forEach(visit);
      if (!covered.length) continue;
      const left = Math.min(...covered.map(n => n.x)) - 14, top = Math.min(...covered.map(n => n.y)) - 14;
      const right = Math.max(...covered.map(n => n.x + n.width)) + 14, bottom = Math.max(...covered.map(n => n.y + n.height)) + 14;
      if (boundary.summaryId) {
        const summary = byId.get(boundary.summaryId); if (!summary) continue;
        const x = summary.side > 0 ? right : left, step = summary.side * 12;
        path(`M${x},${top} h${step} V${bottom} h${-step} M${x+step},${(top+bottom)/2} H${summary.side > 0 ? summary.x : summary.x+summary.width}`, "#8892a5");
      } else {
        edges.append(svg("rect", { x: left, y: top, width: right-left, height: bottom-top, rx: 16, fill: "#dde8ff", "fill-opacity": .25, stroke: "#8b9ec4", "stroke-dasharray": "6 4", class: "mm-boundary" }));
        if (boundary.title) edges.append(label(boundary.title, left+8, top-5));
      }
    }
  }
  const relationships = [...(sheet.relationships || []), ...layout.boxes.flatMap(b => b.topic.relationships)];
  for (const r of relationships) { const a = byId.get(r.from), b = byId.get(r.to); if (a && b) connect(a, b, true, r.title); }
  for (const b of layout.boxes) {
    const t = b.topic, fill = t.style.fill || (t === sheet.root ? "#e0eaff" : "#ffffff");
    const node = svg("g", { transform: `translate(${b.x} ${b.y})`, class: "mm-node", "data-topic-id": t.id, "data-kind": t.kind, role: "button", tabindex: 0, "aria-label": t.title || copy.untitled });
    const title = svg("title"); title.textContent = [t.title, ...t.markers, ...t.labels].join(" · "); node.append(title);
    const shape = t.style.shape?.toLowerCase() || "";
    if (/ellipse|oval/.test(shape)) node.append(svg("ellipse", { cx: b.width/2, cy: b.height/2, rx: b.width/2, ry: b.height/2, fill, stroke: t.style.stroke || "#9bacc7" }));
    else node.append(svg("rect", { width: b.width, height: b.height, rx: /rectangle|rect$/.test(shape) ? 2 : 10, fill, stroke: /underline|fork|:line$/.test(shape) ? "none" : t.style.stroke || "#9bacc7" }));
    if (/underline|fork|:line$/.test(shape)) node.append(svg("path", { d: `M0,${b.height} H${b.width}`, stroke: t.style.stroke || "#9bacc7" }));
    let y = 16;
    const url = t.image && urls.get(t.image);
    if (url) {
      const height = Math.min(180, t.imageHeight || 100);
      node.append(svg("image", { href: url, x: 12, y: 8, width: b.width - 24, height, preserveAspectRatio: "xMidYMid meet" }));
      y += height + 10;
    }
    const text = svg("text", { x: b.width/2, y: y + b.font, "text-anchor": "middle", "font-size": b.font,
      fill: t.style.color || contrast(fill), "font-weight": t.style.bold ? 700 : 400, "font-style": t.style.italic ? "italic" : "normal" });
    for (let i = 0; i < b.lines.length; i++) { const line = svg("tspan", { x: b.width/2, dy: i ? b.font*1.35 : 0 }); line.textContent = b.lines[i] || (i === 0 ? copy.untitled : " "); text.append(line); }
    node.append(text);
    if (t.markers.length || t.labels.length) {
      const badges = [...t.markers.map(markerLabel), ...t.labels];
      const available = Math.max(4, Math.floor((b.width - 20) / 7));
      const full = badges.join(" · ");
      const markers = label(full.length > available ? full.slice(0, available - 1) + "…" : full, 10, b.height - 8, 11);
      markers.setAttribute("fill", t.style.color || contrast(fill)); node.append(markers);
    }
    if (t.notes || t.link || Object.keys(t.metadata).length) node.append(label("ⓘ", b.width - 14, 13, 11));
    node.addEventListener("click", () => select(t));
    node.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(t); } });
    if (t.children.length) {
      const control = svg("g", { role: "button", tabindex: 0, "aria-label": collapsed.has(t) ? copy.expand : copy.collapse, "aria-expanded": String(!collapsed.has(t)), class: "mm-fold" });
      control.append(svg("circle", { cx: b.side > 0 ? b.width + 11 : -11, cy: b.height/2, r: 10, fill: "#fff", stroke: "#94a3b8" }));
      control.append(label(collapsed.has(t) ? "+" : "−", (b.side > 0 ? b.width + 11 : -11) - 4, b.height/2 + 4));
      control.addEventListener("click", e => { e.stopPropagation(); toggle(t); });
      control.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggle(t); } });
      node.append(control);
    }
    nodes.append(node);
  }
  return group;
}
function markerLabel(id: string) {
  if (/priority-\d/.test(id)) return `❗${id.split("-").pop()}`;
  if (id.startsWith("tag-")) return "◆";
  if (id.startsWith("people-")) return "♟";
  if (id.includes("symbol_like")) return "👍";
  const progress = ["start", "oct", "quarter", "3oct", "half", "5oct", "3quar", "7oct", "done"];
  if (id.startsWith("task-")) { const part = progress.indexOf(id.slice(5)); if (part >= 0) return `${Math.round(part * 12.5)}%`; }
  if (id.startsWith("flag")) return "⚑";
  if (id.startsWith("star")) return "★";
  return ({ yes: "✓", no: "✗", idea: "💡", help: "?", button_ok: "✓", button_cancel: "✗" } as Record<string, string>)[id] || id;
}
