import { BLACK, parsePaint, type Paint } from "./color";
import type { OfdDocument, StampRef } from "./document";
import { abbreviatedToSvg, multiply, parseMatrix, type Matrix } from "./geometry";
import { OFD_LIMITS } from "./limits";
import { OfdFormatError, OfdLimitError, dirOf } from "./package";
import { ResourceTable, loadResources, type DrawParamDef, type FontDef } from "./res";
import { boolAttr, child, childText, children, numberAttr, numbers, parseBox, parseXml } from "./xml";

export interface LineStyle {
  readonly width: number;
  readonly cap: CanvasLineCap;
  readonly join: CanvasLineJoin;
  readonly miterLimit: number;
  readonly dash: readonly number[];
  readonly dashOffset: number;
}

export interface ClipPath {
  readonly d: string;
  readonly rule: CanvasFillRule;
  readonly transform: Matrix;
}

export interface Glyph {
  readonly x: number;
  readonly y: number;
  /** Glyph id from `CGTransform`; otherwise looked up from `text` in the font's cmap. */
  readonly index?: number;
  /** Characters this glyph stands for (empty for the extra glyphs of a cluster). */
  readonly text: string;
}

/** Tiling pattern: `cell` is repeated every `xStep`×`yStep` in the pattern space mapped by `ctm`. */
export interface PatternPaint {
  readonly kind: "pattern";
  readonly xStep: number;
  readonly yStep: number;
  readonly ctm?: Matrix;
  readonly cell: readonly OfdNode[];
}

export type NodePaint = Paint | PatternPaint;

interface NodeBase {
  /** `Boundary` origin in the parent space. */
  readonly offset?: readonly [number, number];
  /** Clip paths in the boundary space (intersected). */
  readonly clips?: readonly ClipPath[];
  readonly ctm?: Matrix;
  readonly alpha: number;
}

export type OfdNode = NodeBase &
  (
    | { readonly kind: "group"; readonly children: readonly OfdNode[] }
    | { readonly kind: "path"; readonly d: string; readonly rule: CanvasFillRule; readonly fill?: NodePaint; readonly stroke?: NodePaint; readonly line: LineStyle }
    | {
        readonly kind: "text";
        /** Embedded font part, when present. */
        readonly font?: string;
        readonly family: string;
        readonly bold: boolean;
        readonly italic: boolean;
        readonly size: number;
        readonly hScale: number;
        /** Per-glyph rotation in degrees (`CharDirection`). */
        readonly rotation: number;
        readonly fill?: NodePaint;
        readonly stroke?: NodePaint;
        readonly line: LineStyle;
        readonly glyphs: readonly Glyph[];
      }
    | { readonly kind: "image"; readonly part: string }
    | { readonly kind: "stamp"; readonly seal: string; readonly width: number; readonly height: number }
  );

export interface OfdPage {
  readonly width: number;
  readonly height: number;
  readonly root: OfdNode;
  readonly fonts: ReadonlySet<string>;
  readonly images: ReadonlySet<string>;
  readonly seals: ReadonlySet<string>;
}

const CAPS: Record<string, CanvasLineCap> = { Butt: "butt", Round: "round", Square: "square" };
const JOINS: Record<string, CanvasLineJoin> = { Miter: "miter", Round: "round", Bevel: "bevel" };
const LAYER_ORDER: Record<string, number> = { Background: 0, Body: 1, Foreground: 2 };
const SERIF_HINT = /宋|仿宋|楷|明|song|kai|fang|ming|serif|times/i;
const MONO_HINT = /courier|mono|consol/i;

export function sealKey(stamp: StampRef) {
  return stamp.sources.join("|");
}

/** Expands `ST_Array` deltas with the `g <count> <value>` repetition syntax. */
export function expandDeltas(value: string | null): number[] {
  const tokens = (value ?? "").trim().split(/\s+/).filter(Boolean);
  const out: number[] = [];
  for (let i = 0; i < tokens.length && out.length < OFD_LIMITS.pageGlyphs; i += 1) {
    if (tokens[i] === "g") {
      const count = Math.min(Number(tokens[i + 1]) || 0, OFD_LIMITS.pageGlyphs);
      const delta = Number(tokens[i + 2]) || 0;
      for (let k = 0; k < count; k += 1) out.push(delta);
      i += 2;
    } else {
      out.push(Number(tokens[i]) || 0);
    }
  }
  return out;
}

export function cssFamily(font: FontDef | undefined) {
  const names = [font?.name, font?.family].filter((name): name is string => !!name?.trim());
  const quoted = [...new Set(names)].map((name) => `"${name.replace(/["\\]/g, "")}"`);
  const hint = names.join(" ");
  const generic = font?.fixedWidth || MONO_HINT.test(hint)
    ? "monospace"
    : font?.serif || SERIF_HINT.test(hint)
      ? '"Songti SC", SimSun, "Noto Serif CJK SC", serif'
      : '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  return [...quoted, generic].join(", ");
}

function isWide(text: string) {
  return /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(text);
}

interface Scope {
  readonly resources: ResourceTable;
  readonly drawParam?: DrawParamDef;
  readonly depth: number;
}

class PageBuilder {
  nodes = 0;
  glyphs = 0;
  readonly fonts = new Set<string>();
  readonly images = new Set<string>();
  readonly seals = new Set<string>();

  /** Merges a DrawParam with its `Relative` chain (nearest wins). */
  drawParam(resources: ResourceTable, id: string | null, inherited?: DrawParamDef): DrawParamDef | undefined {
    const chain: DrawParamDef[] = [];
    const seen = new Set<string>();
    for (let next = id; next && !seen.has(next) && chain.length < 16; ) {
      seen.add(next);
      const param = resources.get("drawParams", next);
      if (!param) break;
      chain.push(param);
      next = param.relative ?? null;
    }
    if (!chain.length) return inherited;
    return chain.reverse().reduce<DrawParamDef>((merged, param) => ({ ...merged, ...defined(param) }), { ...inherited });
  }

  /** Object colour, else DrawParam colour, else black; `Pattern` children become tiled cells. */
  paint(element: Element | undefined, scope: Scope): NodePaint {
    const pattern = element && child(element, "Pattern");
    const cell = pattern && child(pattern, "CellContent");
    if (pattern && cell) {
      const width = numberAttr(pattern, "Width") ?? 0;
      const height = numberAttr(pattern, "Height") ?? 0;
      const xStep = numberAttr(pattern, "XStep") ?? width;
      const yStep = numberAttr(pattern, "YStep") ?? height;
      if (xStep > 0 && yStep > 0) {
        return {
          kind: "pattern",
          xStep,
          yStep,
          ctm: parseMatrix(pattern.getAttribute("CTM")),
          cell: this.graphics(cell, { ...scope, depth: scope.depth + 1 }),
        };
      }
    }
    return parsePaint(element, scope.resources) ?? BLACK;
  }

  graphics(container: Element, scope: Scope): OfdNode[] {
    if (scope.depth > OFD_LIMITS.nestingDepth) throw new OfdLimitError("Graphic nesting too deep.");
    const out: OfdNode[] = [];
    for (const element of Array.from(container.children)) {
      const node = this.graphic(element, scope);
      if (node) out.push(node);
    }
    return out;
  }

  private graphic(element: Element, scope: Scope): OfdNode | undefined {
    const name = element.localName;
    if (name === "PageBlock") {
      return { kind: "group", alpha: 1, children: this.graphics(element, { ...scope, depth: scope.depth + 1 }) };
    }
    if (!["PathObject", "TextObject", "ImageObject", "CompositeObject"].includes(name)) return undefined;
    if (boolAttr(element, "Visible") === false) return undefined;
    if (++this.nodes > OFD_LIMITS.pageNodes) throw new OfdLimitError("Too many graphic objects.");
    const { resources } = scope;
    const param = this.drawParam(resources, element.getAttribute("DrawParam"), scope.drawParam);
    const box = parseBox(element.getAttribute("Boundary"));
    const base: NodeBase = {
      offset: box ? [box.x, box.y] : undefined,
      clips: this.clips(element),
      ctm: parseMatrix(element.getAttribute("CTM")),
      alpha: Math.max(0, Math.min(255, numberAttr(element, "Alpha") ?? 255)) / 255,
    };
    const line = lineStyle(element, param);
    switch (name) {
      case "PathObject": {
        const d = abbreviatedToSvg(childText(element, "AbbreviatedData") ?? "");
        if (!d) return undefined;
        const fill = boolAttr(element, "Fill") ?? false;
        const stroke = boolAttr(element, "Stroke") ?? true;
        return {
          ...base,
          kind: "path",
          d,
          rule: /even/i.test(element.getAttribute("Rule") ?? "") ? "evenodd" : "nonzero",
          fill: fill ? this.paint(child(element, "FillColor") ?? param?.fillColor, scope) : undefined,
          stroke: stroke ? this.paint(child(element, "StrokeColor") ?? param?.strokeColor, scope) : undefined,
          line,
        };
      }
      case "TextObject":
        return this.text(element, base, line, param, scope);
      case "ImageObject": {
        const part = resources.get("media", element.getAttribute("ResourceID"))?.part;
        if (!part) return undefined;
        this.images.add(part);
        return { ...base, kind: "image", part };
      }
      default: {
        const unit = resources.get("composites", element.getAttribute("ResourceID"));
        if (!unit) return undefined;
        return { ...base, kind: "group", children: this.graphics(unit.content, { ...scope, depth: scope.depth + 1 }) };
      }
    }
  }

  private clips(element: Element): ClipPath[] | undefined {
    const out: ClipPath[] = [];
    for (const clip of children(child(element, "Clips") ?? element, "Clip")) {
      // Areas of one Clip are united; separate Clips intersect.
      let d = "";
      let transform: Matrix | undefined;
      let rule: CanvasFillRule = "nonzero";
      for (const area of children(clip, "Area")) {
        const path = child(area, "Path");
        if (!path) continue;
        const box = parseBox(path.getAttribute("Boundary"));
        const local = multiply(
          multiply(parseMatrix(path.getAttribute("CTM")) ?? [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, box?.x ?? 0, box?.y ?? 0]),
          parseMatrix(area.getAttribute("CTM")) ?? [1, 0, 0, 1, 0, 0],
        );
        const data = abbreviatedToSvg(childText(path, "AbbreviatedData") ?? "");
        if (!data) continue;
        if (/even/i.test(path.getAttribute("Rule") ?? "")) rule = "evenodd";
        // Areas rarely carry different transforms; the first one wins.
        transform ??= local;
        d += ` ${data}`;
      }
      if (d && transform) out.push({ d: d.trim(), rule, transform });
    }
    return out.length ? out : undefined;
  }

  private text(element: Element, base: NodeBase, line: LineStyle, param: DrawParamDef | undefined, scope: Scope): OfdNode | undefined {
    const { resources } = scope;
    const fontDef = resources.get("fonts", element.getAttribute("Font"));
    const size = numberAttr(element, "Size") ?? 0;
    if (!(size > 0)) return undefined;
    const transforms = new Map<number, { codes: number; glyphs: number[] }>();
    for (const cg of children(element, "CGTransform")) {
      const glyphs = numbers(childText(cg, "Glyphs")).slice(0, numberAttr(cg, "GlyphCount") ?? Infinity);
      transforms.set(numberAttr(cg, "CodePosition") ?? 0, { codes: Math.max(1, numberAttr(cg, "CodeCount") ?? 1), glyphs });
    }
    const glyphs: Glyph[] = [];
    let charIndex = 0;
    let x = 0;
    let y = 0;
    for (const code of children(element, "TextCode")) {
      const chars = Array.from((code.textContent ?? "").replace(/^[\r\n\t]+|[\r\n\t]+$/g, ""));
      x = numberAttr(code, "X") ?? x;
      y = numberAttr(code, "Y") ?? y;
      const dx = expandDeltas(code.getAttribute("DeltaX"));
      const dy = expandDeltas(code.getAttribute("DeltaY"));
      const items: { index?: number; text: string }[] = [];
      for (let i = 0; i < chars.length; ) {
        const cluster = transforms.get(charIndex + i);
        if (cluster && cluster.glyphs.length) {
          const text = chars.slice(i, i + cluster.codes).join("");
          cluster.glyphs.forEach((index, k) => items.push({ index, text: k ? "" : text }));
          i += cluster.codes;
        } else {
          items.push({ text: chars[i]! });
          i += 1;
        }
      }
      charIndex += chars.length;
      this.glyphs += items.length;
      if (this.glyphs > OFD_LIMITS.pageGlyphs) throw new OfdLimitError("Too many glyphs.");
      items.forEach((item, k) => {
        glyphs.push({ ...item, x, y });
        x += dx[k] ?? (isWide(item.text) ? size : size * 0.5);
        y += dy[k] ?? 0;
      });
    }
    if (!glyphs.length) return undefined;
    if (fontDef?.file) this.fonts.add(fontDef.file);
    const fill = boolAttr(element, "Fill") ?? true;
    const stroke = boolAttr(element, "Stroke") ?? false;
    return {
      ...base,
      kind: "text",
      font: fontDef?.file,
      family: cssFamily(fontDef),
      bold: (numberAttr(element, "Weight") ?? 400) >= 600 || !!fontDef?.bold,
      italic: boolAttr(element, "Italic") ?? fontDef?.italic ?? false,
      size,
      hScale: numberAttr(element, "HScale") ?? 1,
      rotation: numberAttr(element, "CharDirection") ?? 0,
      fill: fill ? this.paint(child(element, "FillColor") ?? param?.fillColor, scope) : undefined,
      stroke: stroke ? this.paint(child(element, "StrokeColor") ?? param?.strokeColor, scope) : undefined,
      line,
      glyphs,
    };
  }

  layers(page: Element, scope: Scope): OfdNode[] {
    const layers = children(child(page, "Content") ?? page, "Layer")
      .map((layer, index) => ({ layer, index, rank: LAYER_ORDER[layer.getAttribute("Type") ?? "Body"] ?? 1 }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index);
    return layers.map(({ layer }) => ({
      kind: "group" as const,
      alpha: 1,
      children: this.graphics(layer, {
        ...scope,
        drawParam: this.drawParam(scope.resources, layer.getAttribute("DrawParam"), scope.drawParam),
      }),
    }));
  }
}

function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function lineStyle(element: Element, param: DrawParamDef | undefined): LineStyle {
  const dash = numbers(element.getAttribute("DashPattern"));
  return {
    width: numberAttr(element, "LineWidth") ?? param?.lineWidth ?? 0.353,
    cap: CAPS[element.getAttribute("Cap") ?? param?.cap ?? ""] ?? "butt",
    join: JOINS[element.getAttribute("Join") ?? param?.join ?? ""] ?? "miter",
    miterLimit: numberAttr(element, "MiterLimit") ?? param?.miterLimit ?? 3.528,
    dash: dash.length ? dash : (param?.dashPattern ?? []),
    dashOffset: numberAttr(element, "DashOffset") ?? param?.dashOffset ?? 0,
  };
}

async function pageResources(doc: OfdDocument, page: Element, path: string) {
  const resources = new ResourceTable(doc.resources);
  for (const res of children(page, "PageRes")) {
    const part = doc.pkg.resolve(dirOf(path), res.textContent);
    if (!part) continue;
    await loadResources(doc.pkg, part, resources).catch((error: unknown) => {
      if (!(error instanceof OfdFormatError)) throw error;
    });
  }
  return resources;
}

/** Parses page `index` with its templates, annotations and seal stamps into a display tree. */
export async function loadOfdPage(doc: OfdDocument, index: number): Promise<OfdPage> {
  const ref = doc.pages[index];
  if (!ref) throw new OfdFormatError("Page out of range.");
  const { pkg } = doc;
  const page = parseXml(await pkg.text(ref.part));
  if (page.localName !== "Page") throw new OfdFormatError("Not an OFD page.");
  const box = parseBox(childText(page, "Area", "PhysicalBox")) ?? doc.pageArea;
  const builder = new PageBuilder();
  const scope: Scope = { resources: await pageResources(doc, page, ref.part), depth: 0 };

  const background: OfdNode[] = [];
  const foreground: OfdNode[] = [];
  for (const use of children(page, "Template")) {
    const template = doc.templates.get(use.getAttribute("TemplateID")?.trim() ?? "");
    if (!template) continue;
    const root = parseXml(await pkg.text(template.part));
    const nodes = builder.layers(root, { resources: await pageResources(doc, root, template.part), depth: 0 });
    const zOrder = use.getAttribute("ZOrder") ?? template.zOrder;
    (zOrder === "Foreground" ? foreground : background).push(...nodes);
  }

  const annotations: OfdNode[] = [];
  for (const part of doc.annotations.get(ref.id) ?? []) {
    let root: Element;
    try {
      root = parseXml(await pkg.text(part));
    } catch (error) {
      if (error instanceof OfdFormatError) continue; // A broken annotation part never blanks the page.
      throw error;
    }
    for (const annot of children(root, "Annot")) {
      const appearance = child(annot, "Appearance");
      const box = parseBox(appearance?.getAttribute("Boundary"));
      if (!appearance || boolAttr(annot, "Visible") === false) continue;
      annotations.push({ kind: "group", alpha: 1, offset: box ? [box.x, box.y] : undefined, children: builder.graphics(appearance, scope) });
    }
  }

  const stamps: OfdNode[] = (doc.stamps.get(ref.id) ?? []).map((stamp) => {
    const seal = sealKey(stamp);
    builder.seals.add(seal);
    const { x, y, width, height } = stamp.boundary;
    return { kind: "stamp", alpha: 1, offset: [x, y], seal, width, height };
  });

  const content = [...background, ...builder.layers(page, scope), ...foreground, ...annotations, ...stamps];
  return {
    width: box.width,
    height: box.height,
    root: { kind: "group", alpha: 1, offset: [-box.x, -box.y], children: content },
    fonts: builder.fonts,
    images: builder.images,
    seals: builder.seals,
  };
}
