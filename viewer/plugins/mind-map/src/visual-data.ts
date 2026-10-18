import { color, finite, type Topic, type TopicKind, type Relationship } from "./model";
const obj = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
export const direct = (e: Element | undefined, name: string) => e ? Array.from(e.children).filter(c => c.localName === name) : [];
const first = (e: Element | undefined, name: string) => direct(e, name)[0];
const attr = (e: Element | undefined, name: string) => e ? Array.from(e.attributes).find(a => a.localName === name)?.value ?? "" : "";
const managerColor = (v: string) => /^[\da-f]{8}$/i.test(v) ? `#${v.slice(2)}${v.slice(0, 2)}` : undefined;
function range(value: string) {
  const match = /^\((\d+),(\d+)\)$/.exec(value);
  return match ? { start: Number(match[1]), end: Number(match[2]) } : undefined;
}
export function jsonVisual(topic: Topic, data: Record<string, unknown>) {
  topic.id = str(data.id) || topic.id;
  topic.structure = str(data.structureClass);
  topic.folded = data.branch === "folded";
  const position = obj(data.position), x = finite(position.x), y = finite(position.y);
  if (x !== undefined && y !== undefined) topic.position = { x, y };
  const p = obj(obj(data.style).properties);
  topic.style = { color: color(p["fo:color"]), fill: color(p["svg:fill"]), stroke: color(p["line-color"]),
    fontSize: finite(str(p["fo:font-size"]).replace(/pt$/, "")), bold: p["fo:font-weight"] === "bold",
    italic: p["fo:font-style"] === "italic", shape: str(p["shape-class"]) };
  if (topic.link.startsWith("xap:")) topic.attachments.push({ name: topic.title || topic.link.split("/").pop()!, path: topic.link });
  const image = obj(data.image);
  topic.image = str(image.src) || undefined;
  topic.imageWidth = finite(image.width); topic.imageHeight = finite(image.height);
  topic.markers = arr(data.markers).map(m => str(obj(m).markerId)).filter(Boolean);
  topic.labels = arr(data.labels).map(str).filter(Boolean);
  for (const [key, value] of Object.entries(obj(data.task))) if (typeof value === "string" || typeof value === "number") topic.metadata[key] = String(value);
  for (const entry of arr(data.boundaries)) {
    const b = obj(entry), r = range(str(b.range));
    if (r) topic.boundaries.push({ ...r, title: str(b.title) });
  }
  for (const entry of arr(data.summaries)) {
    const b = obj(entry), r = range(str(b.range));
    if (r) topic.boundaries.push({ ...r, title: "", summaryId: str(b.topicId) });
  }
}
export function jsonRelationships(value: unknown): Relationship[] {
  return arr(value).map(v => { const r = obj(v); return { from: str(r.end1Id), to: str(r.end2Id), title: str(r.title) }; });
}
export function xmlVisual(topic: Topic, element: Element, format: string) {
  topic.id = attr(element, format === "mm" ? "ID" : format === "mmap" ? "OId" : "id") || topic.id;
  if (format === "mm") {
    const font = first(element, "font"), edge = first(element, "edge");
    topic.style = { color: color(attr(element, "COLOR")), fill: color(attr(element, "BACKGROUND_COLOR")),
      stroke: color(attr(edge, "COLOR")), fontSize: finite(attr(font, "SIZE")), bold: attr(font, "BOLD") === "true",
      italic: attr(font, "ITALIC") === "true", shape: attr(element, "STYLE") };
    topic.direction = attr(element, "POSITION") === "left" ? "left" : attr(element, "POSITION") === "right" ? "right" : undefined;
    topic.folded = attr(element, "FOLDED") === "true";
    topic.markers = direct(element, "icon").map(e => attr(e, "BUILTIN"));
    topic.relationships = direct(element, "arrowlink").map(e => ({ from: topic.id, to: attr(e, "DESTINATION"), title: attr(e, "MIDDLE_LABEL") }));
    for (const e of direct(element, "attribute")) topic.metadata[attr(e, "NAME")] = attr(e, "VALUE");
    const image = Array.from(element.querySelectorAll("richcontent img")).find(e => e.closest("node") === element);
    topic.image = attr(image, "src") || undefined;
    topic.imageWidth = finite(attr(image, "width")); topic.imageHeight = finite(attr(image, "height"));
  } else if (format === "mmap") {
    const font = first(first(element, "Text"), "Font"), c = first(element, "Color");
    topic.style = { color: managerColor(attr(font, "Color")), fill: managerColor(attr(c, "FillColor")), stroke: managerColor(attr(c, "LineColor")),
      fontSize: finite(attr(font, "Size")), bold: attr(font, "Bold") === "true", italic: attr(font, "Italic") === "true",
      shape: attr(first(element, "SubTopicShape") ?? first(element, "TopicShape"), "SubTopicShape") };
    topic.folded = attr(first(first(element, "TopicViewGroup"), "Collapsed"), "Collapsed") === "true";
    const shape = first(element, "SubTopicsShape");
    topic.structure = attr(shape, "SubTopicsGrowthDirection");
    if (topic.structure.endsWith(":Right")) topic.structure = "logic.right";
    if (topic.structure.endsWith(":Left")) topic.structure = "logic.left";
    if (topic.structure.endsWith(":Left")) topic.direction = "left";
    if (topic.structure.endsWith(":Right")) topic.direction = "right";
    const position = first(element, "Position");
    const x = finite(attr(position, "X")), y = finite(attr(position, "Y"));
    if (x !== undefined && y !== undefined) topic.position = { x: x * 3.78, y: y * 3.78 };
    for (const group of direct(element, "Task")) for (const a of Array.from(group.attributes)) {
      if (!["Dirty", "Gen", "OId"].includes(a.name)) topic.metadata[a.localName] = a.value;
    }
    for (const group of direct(element, "TaskGroup")) for (const e of Array.from(group.children)) for (const a of Array.from(e.attributes)) {
      if (!["Dirty", "Gen", "OId"].includes(a.name)) topic.metadata[a.localName] = a.value;
    }
    const image = first(first(element, "OneImage"), "Image");
    const imageData = first(image, "ImageData");
    topic.image = attr(imageData, "ExternalBinaryLocation") || undefined;
    if (!topic.image) {
      const mime = ({ "urn:mindjet:PngImage": "image/png", "urn:mindjet:JpegImage": "image/jpeg", "urn:mindjet:GifImage": "image/gif" } as Record<string, string>)[attr(imageData, "ImageType")];
      const encoded = first(imageData, "Base64")?.textContent?.replace(/\s/g, "");
      if (mime && encoded) topic.image = `data:${mime};base64,${encoded}`;
    }
    topic.imageWidth = finite(attr(first(image, "ImageSize"), "Width"));
    topic.imageHeight = finite(attr(first(image, "ImageSize"), "Height"));
    topic.attachments = direct(first(element, "AttachmentGroup"), "AttachmentData").map(e => ({ name: attr(e, "FileName"), path: attr(e, "ExternalBinaryLocation") }));
    topic.labels = direct(first(element, "TextLabels"), "TextLabel").map(e => attr(e, "TextLabelName"));
  } else {
    if (topic.link.startsWith("xap:")) topic.attachments.push({ name: topic.title || topic.link.split("/").pop()!, path: topic.link });
    topic.structure = attr(element, "structure-class"); topic.folded = attr(element, "branch") === "folded";
    const position = first(element, "position"), x = finite(attr(position, "x")), y = finite(attr(position, "y"));
    if (x !== undefined && y !== undefined) topic.position = { x, y };
    const image = first(element, "img");
    topic.image = image?.getAttributeNS("http://www.w3.org/1999/xlink", "src") || attr(image, "src") || undefined;
    topic.imageWidth = finite(attr(image, "width")); topic.imageHeight = finite(attr(image, "height"));
    topic.markers = direct(first(element, "marker-refs"), "marker-ref").map(e => attr(e, "marker-id"));
    topic.labels = direct(first(element, "labels"), "label").map(e => e.textContent ?? "");
    for (const e of direct(first(element, "boundaries"), "boundary")) {
      const r = range(attr(e, "range")); if (r) topic.boundaries.push({ ...r, title: first(e, "title")?.textContent ?? "" });
    }
    for (const e of direct(first(element, "summaries"), "summary")) {
      const r = range(attr(e, "range")); if (r) topic.boundaries.push({ ...r, title: "", summaryId: attr(e, "topic-id") });
    }
  }
}
export function xmlRelationships(sheet: Element): Relationship[] {
  return direct(first(sheet, "relationships"), "relationship").map(e => ({ from: attr(e, "end1"), to: attr(e, "end2"), title: first(e, "title")?.textContent ?? "" }));
}
export function kind(value: string): TopicKind {
  return ["detached", "summary", "callout"].includes(value) ? value as TopicKind : "attached";
}
export function applyLegacyStyles(sheets: {root: Topic}[], source: string) {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  const styles = new Map(Array.from(doc.getElementsByTagNameNS("*", "style")).map(e => [attr(e, "id"), first(e, "topic-properties")]));
  function visit(t: Topic) {
    const p = styles.get(t.metadata.styleId);
    if (p) t.style = { color: color(attr(p, "color")), fill: color(attr(p, "fill")), stroke: color(attr(p, "line-color")),
      fontSize: finite(attr(p, "font-size").replace(/pt$/, "")), bold: attr(p, "font-weight") === "bold", italic: attr(p, "font-style") === "italic", shape: attr(p, "shape-class") };
    delete t.metadata.styleId; t.children.forEach(visit);
  }
  sheets.forEach(s => visit(s.root));
}

export function managerRelationships(root: Element): Relationship[] {
  return direct(first(root, "Relationships"), "Relationship").map(e => {
    const ends = direct(e, "ConnectionGroup").sort((a,b) => Number(attr(a,"Index"))-Number(attr(b,"Index")));
    return { from: attr(first(ends[0], "Connection"), "OIdRef"), to: attr(first(ends[1], "Connection"), "OIdRef"), title: "" };
  });
}
export function managerDefaults(element: Element, root: Element, depth: number) {
  const styles = first(root, "StyleGroup");
  const levels = direct(styles, "RootSubTopicDefaultsGroup");
  const defaults = depth === 0 ? first(styles, "RootTopicDefaultsGroup") : levels.find(e => Number(attr(e, "Level")) === depth - 1) ?? levels.at(-1);
  for (const name of ["Color", "SubTopicsShape", "SubTopicShape", "Text"]) {
    const original = first(defaults, `Default${name}`); if (!original) continue;
    let target = first(element, name);
    if (!target) { target = element.ownerDocument.createElementNS(element.namespaceURI, name); element.append(target); }
    if (name === "Text") {
      const sourceFont = first(original, "Font"); if (!sourceFont) continue;
      let font = first(target, "Font");
      if (!font) { font = sourceFont.cloneNode(true) as Element; target.append(font); }
      else for (const a of Array.from(sourceFont.attributes)) if (!font.hasAttribute(a.name)) font.setAttribute(a.name, a.value);
    } else for (const a of Array.from(original.attributes)) if (!target.hasAttribute(a.name)) target.setAttribute(a.name, a.value);
  }
}
