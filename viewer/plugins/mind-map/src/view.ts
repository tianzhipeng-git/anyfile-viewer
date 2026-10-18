import type { Sheet, Topic } from "./model";
import type { MindMapCopy } from "./messages";
import { layoutMap, type MapLayout } from "./layout";
import { drawDiagram, svg } from "./diagram";

export function createMindMapView(sheets: Sheet[], copy: MindMapCopy) {
  const root = document.createElement("section");
  root.className = "anyfile-mind-map";
  const style = document.createElement("style");
  style.textContent = `
    .anyfile-mind-map{box-sizing:border-box;width:100%;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;color:var(--viewer-foreground,#222);background:var(--viewer-background,#fff);font-family:var(--viewer-font-family,system-ui)}
    .anyfile-mind-map *{box-sizing:border-box}
    .anyfile-mind-map .mm-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px;flex:none;border-bottom:1px solid var(--viewer-border,#ccc)}
    .anyfile-mind-map button,.anyfile-mind-map select,.anyfile-mind-map input{font:inherit;color:inherit;background:var(--viewer-background,#fff);border:1px solid var(--viewer-border,#ccc);border-radius:6px;padding:6px 10px;max-width:100%}
    .anyfile-mind-map button{cursor:pointer}.anyfile-mind-map select{max-width:180px}.anyfile-mind-map input{width:140px;min-width:0}
    .anyfile-mind-map :focus-visible{outline:2px solid var(--viewer-accent,#4169e1);outline-offset:2px}
    .anyfile-mind-map .mm-body{display:flex;flex:1;min-height:0;overflow:hidden}
    .anyfile-mind-map .mm-viewport{flex:1;min-width:0;min-height:0;overflow:hidden;background:#f8fafc;position:relative;touch-action:none}
    .anyfile-mind-map .mm-canvas{display:block;width:100%;height:100%;cursor:grab;font-family:system-ui,sans-serif}
    .anyfile-mind-map .mm-node{cursor:pointer}.anyfile-mind-map .mm-node:focus>rect,.anyfile-mind-map .mm-node[data-selected=true]>rect{stroke:#2563eb;stroke-width:3}
    .anyfile-mind-map .mm-details{width:260px;max-width:40%;padding:16px;overflow:auto;border-left:1px solid var(--viewer-border,#ccc);overflow-wrap:anywhere;white-space:pre-wrap}
    .anyfile-mind-map .mm-details[hidden]{display:none}
    .anyfile-mind-map .mm-details h2{font-size:18px;margin:0 0 12px}.anyfile-mind-map .mm-details h3{font-size:13px;margin:18px 0 6px}
    .anyfile-mind-map .mm-details p{margin:6px 0}.anyfile-mind-map .mm-status{font-size:12px;padding:5px 10px;border-top:1px solid var(--viewer-border,#ccc)}
    @media(max-width:640px){.anyfile-mind-map .mm-body{flex-direction:column}.anyfile-mind-map .mm-details{width:100%;max-width:100%;max-height:30%;border-left:0;border-top:1px solid var(--viewer-border,#ccc)}}
  `;
  const toolbar = document.createElement("div"); toolbar.className = "mm-toolbar";
  const selector = document.createElement("select"); selector.setAttribute("aria-label", copy.sheet);
  sheets.forEach((s, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = s.title || `${copy.sheet} ${i+1}`; selector.append(o); });
  const viewport = document.createElement("div"); viewport.className = "mm-viewport";
  const canvas = svg("svg", { class: "mm-canvas", tabindex: 0, role: "group", "aria-label": copy.diagram });
  const details = document.createElement("aside"); details.className = "mm-details"; details.hidden = true;
  const body = document.createElement("div"); body.className = "mm-body";
  const status = document.createElement("div"); status.className = "mm-status";
  const zoom = document.createElement("output");
  const search = document.createElement("input"); search.type = "search"; search.placeholder = copy.search; search.setAttribute("aria-label", copy.search);
  const listeners = new AbortController();
  const urls = new Map<string, string>();
  let sheet = sheets[0], layout: MapLayout, selected = sheet.root, disposed = false;
  let scale = 1, cx = 0, cy = 0, fitting = true;
  let drag: { id: number; x: number; y: number; moved: boolean } | undefined;
  let moved = false;
  const collapsed = new Set<Topic>();
  const measureCanvas = document.createElement("canvas"), ctx = measureCanvas.getContext("2d");
  const measure = (text: string, size: number, bold: boolean) => {
    if (ctx) { ctx.font = `${bold ? 700 : 400} ${size}px system-ui`; return ctx.measureText(text).width; }
    return Array.from(text).reduce((w, c) => w + size * (c.charCodeAt(0) > 255 ? 1 : .58), 0);
  };
  function button(label: string, action: () => void) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label;
    b.addEventListener("click", () => { moved = false; action(); }, { signal: listeners.signal }); return b;
  }
  const dimensions = () => ({ width: viewport.clientWidth || 800, height: viewport.clientHeight || 600 });
  function transform() {
    const { width, height } = dimensions();
    canvas.setAttribute("viewBox", `${cx-width/scale/2} ${cy-height/scale/2} ${width/scale} ${height/scale}`);
    zoom.value = `${Math.round(scale*100)}%`;
  }
  function fit() {
    fitting = true;
    const { width, height } = dimensions(); scale = Math.min(width/layout.width, height/layout.height, 1);
    cx = layout.width/2; cy = layout.height/2; transform();
  }
  function zoomBy(factor: number, x = viewport.clientWidth/2, y = viewport.clientHeight/2) {
    fitting = false;
    const { width, height } = dimensions();
    const old = scale; scale = Math.max(.001, Math.min(8, scale*factor));
    cx += (x-width/2)*(1/old-1/scale); cy += (y-height/2)*(1/old-1/scale); transform();
  }
  function select(topic: Topic, reveal = true) {
    if (disposed || moved) return;
    selected = topic;
    if (reveal) details.hidden = false;
    for (const node of canvas.querySelectorAll(".mm-node")) node.setAttribute("data-selected", String(node.getAttribute("data-topic-id") === topic.id));
    const heading = document.createElement("h2"); heading.textContent = topic.title || copy.untitled;
    const close = document.createElement("button"); close.type = "button"; close.textContent = copy.closeDetails;
    close.onclick = () => { if (!disposed) details.hidden = true; };
    details.replaceChildren(heading, close);
    const section = (name: string, value: string) => {
      if (!value) return;
      const h = document.createElement("h3"); h.textContent = name;
      const p = document.createElement("p"); p.textContent = value; details.append(h, p);
    };
    section(copy.notes, topic.notes);
    if (topic.link) {
      if (/^https?:\/\//i.test(topic.link)) {
        const a = document.createElement("a"); a.textContent = topic.link; a.href = topic.link; a.target = "_blank"; a.rel = "noopener noreferrer"; details.append(a);
      } else section(copy.link, topic.link);
    }
    section(copy.markers, topic.markers.join(" · "));
    section(copy.labels, topic.labels.join(" · "));
    section(copy.metadata, Object.entries(topic.metadata).filter(([k]) => k !== "styleId").map(([k,v]) => `${k}: ${v}`).join("\n"));
    for (const attachment of topic.attachments) {
      const container = document.createElement("details"), summary = document.createElement("summary");
      summary.textContent = `${copy.attachment}: ${attachment.name}`; container.append(summary);
      const imageUrl = urls.get(attachment.path), text = sheet.attachmentText?.get(attachment.path);
      if (imageUrl) { const img = document.createElement("img"); img.src = imageUrl; img.alt = attachment.name; img.style.maxWidth = "100%"; container.append(img); }
      else { const p = document.createElement("pre"); p.style.whiteSpace = "pre-wrap"; p.textContent = text ?? copy.unavailableAttachment; container.append(p); }
      details.append(container);
    }
    if (topic.image && !urls.has(topic.image)) section(copy.image, copy.unavailableImage);
    if (topic.children.length) {
      const control = document.createElement("button"); control.type = "button";
      control.textContent = collapsed.has(topic) ? copy.expand : copy.collapse;
      control.onclick = () => { moved = false; toggle(topic); }; details.append(control);
    }
  }
  function toggle(topic: Topic) {
    if (disposed || moved) return;
    if (collapsed.has(topic)) collapsed.delete(topic); else collapsed.add(topic);
    render();
  }
  function render() {
    if (disposed) return;
    const oldBox = layout?.boxes.find(b => b.topic === selected);
    layout = layoutMap(sheet, collapsed, measure);
    const newBox = layout.boxes.find(b => b.topic === selected);
    if (oldBox && newBox && !fitting) { cx += newBox.x-oldBox.x; cy += newBox.y-oldBox.y; }
    canvas.replaceChildren(drawDiagram(layout, sheet, urls, collapsed, copy, select, toggle));
    if (fitting) fit(); else transform();
    select(selected, false);
    status.textContent = `${copy.topics}: ${layout.boxes.length} · ${copy.navigation}`;
  }
  function loadSheet() {
    for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); collapsed.clear();
    for (const [name, blob] of sheet.assets || []) urls.set(name, URL.createObjectURL(blob));
    const visit = (t: Topic) => { if (t.folded) collapsed.add(t); t.children.forEach(visit); }; visit(sheet.root);
    selected = sheet.root; fitting = true; render();
  }
  function find() {
    const query = search.value.trim().toLocaleLowerCase(); if (!query) return;
    const matches: Topic[] = [];
    const parents = new Map<Topic, Topic>();
    const visit = (t: Topic) => { if (t.title.toLocaleLowerCase().includes(query)) matches.push(t); t.children.forEach(c => { parents.set(c, t); visit(c); }); };
    visit(sheet.root);
    const topic = matches[(matches.indexOf(selected)+1)%matches.length];
    if (!topic) { status.textContent = copy.noResults; return; }
    let parent = parents.get(topic); while (parent) { collapsed.delete(parent); parent = parents.get(parent); }
    render(); select(topic);
    const box = layout.boxes.find(b => b.topic === topic)!; fitting = false; scale = 1; cx = box.x+box.width/2; cy = box.y+box.height/2; transform();
  }
  toolbar.append(selector, button(copy.fit, fit), button("−", () => zoomBy(.8)), zoom, button("+", () => zoomBy(1.25)),
    button(copy.expandAll, () => { collapsed.clear(); fitting = true; render(); }), search, button(copy.find, find));
  selector.addEventListener("change", () => { sheet = sheets[Number(selector.value)]; loadSheet(); }, { signal: listeners.signal });
  search.addEventListener("keydown", e => { if (e.key === "Enter") find(); }, { signal: listeners.signal });
  viewport.append(canvas); body.append(viewport, details); root.append(style, toolbar, body, status);
  viewport.addEventListener("wheel", e => {
    e.preventDefault(); const r = viewport.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.12 : 1/1.12, e.clientX-r.left, e.clientY-r.top);
  }, { passive: false, signal: listeners.signal });
  canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0) return;
    moved = false; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
  }, { signal: listeners.signal });
  canvas.addEventListener("pointermove", e => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX-drag.x, dy = e.clientY-drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    canvas.setPointerCapture?.(e.pointerId);
    drag.moved = moved = true; fitting = false; cx -= dx/scale; cy -= dy/scale; drag.x = e.clientX; drag.y = e.clientY; transform();
  }, { signal: listeners.signal });
  const endDrag = (e: PointerEvent) => { if (drag?.id === e.pointerId) { if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId); drag = undefined; } };
  canvas.addEventListener("pointerup", endDrag, { signal: listeners.signal });
  canvas.addEventListener("pointercancel", endDrag, { signal: listeners.signal });
  canvas.addEventListener("keydown", e => {
    moved = false;
    if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(.8);
    else if (e.key === "0") fit();
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      fitting = false; cx += (e.key === "ArrowRight" ? 80 : e.key === "ArrowLeft" ? -80 : 0)/scale;
      cy += (e.key === "ArrowDown" ? 80 : e.key === "ArrowUp" ? -80 : 0)/scale; transform();
    } else return;
    e.preventDefault();
  }, { signal: listeners.signal });
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (!disposed) { if (fitting) fit(); else transform(); } }) : undefined;
  try { loadSheet(); observer?.observe(viewport); }
  catch (error) {
    listeners.abort(); observer?.disconnect();
    for (const url of urls.values()) URL.revokeObjectURL(url);
    root.replaceChildren(); throw error;
  }
  return { root, dispose() {
    if (disposed) return; disposed = true; listeners.abort(); observer?.disconnect();
    for (const url of urls.values()) URL.revokeObjectURL(url); urls.clear(); collapsed.clear();
    root.replaceChildren(); root.remove(); sheets = [];
  } };
}
