import { parseAbbreviatedGeometry, parseMatrix, parsePathGeometry, type Geometry, type Matrix } from "./geometry";
import { XPS_LIMITS } from "./limits";
import { XpsLimitError, resolvePart, uriFragment } from "./package";
import { parseColor } from "./color";
import { attrLocal, childNamed, descendantsNamed, elementChildren, numberAttr, numberList, propertyValue } from "./xml";

export interface GradientStop {
  readonly offset: number;
  readonly color: string;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type TileMode = "None" | "Tile" | "FlipX" | "FlipY" | "FlipXY";

interface BrushBase {
  readonly opacity: number;
  readonly transform?: Matrix;
}

export type Brush =
  | (BrushBase & { readonly kind: "solid"; readonly color: string })
  | (BrushBase & {
      readonly kind: "linear";
      readonly start: readonly [number, number];
      readonly end: readonly [number, number];
      readonly stops: readonly GradientStop[];
    })
  | (BrushBase & {
      readonly kind: "radial";
      readonly center: readonly [number, number];
      readonly origin: readonly [number, number];
      readonly radiusX: number;
      readonly radiusY: number;
      readonly stops: readonly GradientStop[];
    })
  | (BrushBase & { readonly kind: "image"; readonly image: string; readonly viewbox: Rect; readonly viewport: Rect; readonly tile: TileMode })
  | (BrushBase & { readonly kind: "visual"; readonly visual: XpsNode; readonly viewbox: Rect; readonly viewport: Rect; readonly tile: TileMode });

export interface NodeCommon {
  readonly transform?: Matrix;
  readonly clip?: Geometry;
  readonly opacity: number;
  readonly opacityMask?: Brush;
}

export interface GlyphSpec {
  /** Explicit glyph id; otherwise `codePoint` is mapped through the font `cmap`. */
  readonly index?: number;
  readonly codePoint?: number;
  /** Advance in 1/100 em; font advance when absent. */
  readonly advance?: number;
  readonly u: number;
  readonly v: number;
}

export interface StrokeStyle {
  readonly width: number;
  readonly cap: CanvasLineCap;
  readonly join: CanvasLineJoin;
  readonly miterLimit: number;
  readonly dash: readonly number[];
  readonly dashOffset: number;
}

export type XpsNode =
  | (NodeCommon & { readonly kind: "canvas"; readonly children: readonly XpsNode[] })
  | (NodeCommon & {
      readonly kind: "path";
      readonly geometry: Geometry;
      readonly fill?: Brush;
      readonly stroke?: Brush;
      readonly strokeStyle: StrokeStyle;
    })
  | (NodeCommon & {
      readonly kind: "glyphs";
      /** `part#face` cache key of the embedded font. */
      readonly font: string;
      readonly size: number;
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly glyphs: readonly GlyphSpec[];
      readonly rtl: boolean;
      readonly bold: boolean;
      readonly italic: boolean;
      readonly fill?: Brush;
    });

export interface XpsPage {
  readonly width: number;
  readonly height: number;
  readonly root: XpsNode;
  /** Font and image parts referenced by the page. */
  readonly fonts: ReadonlySet<string>;
  readonly images: ReadonlySet<string>;
}

interface ResourceEntry {
  readonly element: Element;
  readonly base: string;
}

class ResourceScope {
  private readonly entries = new Map<string, ResourceEntry>();
  constructor(private readonly parent?: ResourceScope) {}
  set(key: string, entry: ResourceEntry) {
    this.entries.set(key, entry);
  }
  get(key: string): ResourceEntry | undefined {
    return this.entries.get(key) ?? this.parent?.get(key);
  }
}

interface ParseContext {
  readonly base: string;
  readonly scope: ResourceScope;
  readonly depth: number;
  readonly state: { nodes: number; glyphs: number; readonly fonts: Set<string>; readonly images: Set<string> };
  readonly dictionaries: ReadonlyMap<string, Element>;
}

const STATIC_RESOURCE = /^\s*\{\s*StaticResource\s+([^}\s]+)\s*\}\s*$/;
export const ITALIC_SLANT = Math.tan((20 * Math.PI) / 180);

/** Remote `ResourceDictionary Source="…"` parts the page needs before it can be parsed. */
export function dictionarySources(root: Element, pagePart: string): string[] {
  const out = new Set<string>();
  for (const dictionary of descendantsNamed(root, "ResourceDictionary")) {
    const source = dictionary.getAttribute("Source");
    const part = source ? resolvePart(pagePart, source) : undefined;
    if (part) out.add(part);
  }
  return [...out];
}

function staticKey(value: string | null | undefined) {
  return value ? STATIC_RESOURCE.exec(value)?.[1] : undefined;
}

function addResources(holder: Element | undefined, ctx: ParseContext): ResourceScope {
  if (!holder) return ctx.scope;
  const scope = new ResourceScope(ctx.scope);
  for (const dictionary of elementChildren(holder).filter((node) => node.localName === "ResourceDictionary")) {
    const source = dictionary.getAttribute("Source");
    const remotePart = source ? resolvePart(ctx.base, source) : undefined;
    const remote = remotePart ? ctx.dictionaries.get(remotePart) : undefined;
    const [element, base] = remote ? [remote, remotePart!] : [dictionary, ctx.base];
    for (const entry of elementChildren(element)) {
      const key = attrLocal(entry, "Key");
      if (key) scope.set(key, { element: entry, base });
    }
  }
  return scope;
}

function withBase(ctx: ParseContext, base: string): ParseContext {
  return base === ctx.base ? ctx : { ...ctx, base };
}

function resolveTransform(value: string | null | undefined, ctx: ParseContext): Matrix | undefined {
  if (!value) return undefined;
  const key = staticKey(value);
  if (!key) return parseMatrix(value);
  const entry = ctx.scope.get(key);
  return entry?.element.localName === "MatrixTransform" ? parseMatrix(entry.element.getAttribute("Matrix")) : undefined;
}

function elementTransform(element: Element, attribute: string, property: string, ctx: ParseContext) {
  const attr = element.getAttribute(attribute);
  if (attr) return resolveTransform(attr, ctx);
  const value = propertyValue(element, property);
  return value?.localName === "MatrixTransform" ? parseMatrix(value.getAttribute("Matrix")) : undefined;
}

function geometryFrom(element: Element, ctx: ParseContext): Geometry | undefined {
  if (element.localName !== "PathGeometry") return undefined;
  return parsePathGeometry(element, (value) => resolveTransform(value, ctx));
}

function resolveGeometry(element: Element, attribute: string, ctx: ParseContext): Geometry | undefined {
  const attr = element.getAttribute(attribute);
  if (attr) {
    const key = staticKey(attr);
    if (!key) return parseAbbreviatedGeometry(attr);
    const entry = ctx.scope.get(key);
    return entry ? geometryFrom(entry.element, withBase(ctx, entry.base)) : undefined;
  }
  const value = propertyValue(element, attribute);
  return value ? geometryFrom(value, ctx) : undefined;
}

function point(value: string | null): [number, number] {
  const numbers = numberList(value);
  return [numbers[0] ?? 0, numbers[1] ?? 0];
}

function rect(value: string | null): Rect {
  const [x = 0, y = 0, width = 0, height = 0] = numberList(value);
  return { x, y, width, height };
}

function gradientStops(element: Element) {
  const holder = childNamed(element, `${element.localName}.GradientStops`);
  const stops: GradientStop[] = [];
  for (const stop of holder ? elementChildren(holder) : []) {
    const color = parseColor(stop.getAttribute("Color"));
    if (color) stops.push({ offset: Math.max(0, Math.min(1, numberAttr(stop, "Offset", 0))), color });
  }
  return stops.sort((a, b) => a.offset - b.offset);
}

function imageSourcePart(value: string | null, base: string) {
  if (!value) return undefined;
  const converted = /^\s*\{\s*ColorConvertedBitmap\s+(\S+)/.exec(value);
  return resolvePart(base, converted ? converted[1]! : value);
}

function brushFrom(element: Element, ctx: ParseContext): Brush | undefined {
  const opacity = Math.max(0, Math.min(1, numberAttr(element, "Opacity", 1)));
  const transform = elementTransform(element, "Transform", "Transform", ctx);
  switch (element.localName) {
    case "SolidColorBrush": {
      const color = parseColor(element.getAttribute("Color"));
      return color ? { kind: "solid", color, opacity } : undefined;
    }
    case "LinearGradientBrush": {
      const stops = gradientStops(element);
      if (!stops.length) return undefined;
      return { kind: "linear", opacity, transform, stops, start: point(element.getAttribute("StartPoint")), end: point(element.getAttribute("EndPoint")) };
    }
    case "RadialGradientBrush": {
      const stops = gradientStops(element);
      if (!stops.length) return undefined;
      const center = point(element.getAttribute("Center"));
      const origin = element.hasAttribute("GradientOrigin") ? point(element.getAttribute("GradientOrigin")) : center;
      return {
        kind: "radial", opacity, transform, stops, center, origin,
        radiusX: numberAttr(element, "RadiusX", 0), radiusY: numberAttr(element, "RadiusY", 0),
      };
    }
    case "ImageBrush":
    case "VisualBrush": {
      const tile = (element.getAttribute("TileMode") ?? "None") as TileMode;
      const viewbox = rect(element.getAttribute("Viewbox"));
      const viewport = rect(element.getAttribute("Viewport"));
      if (element.localName === "ImageBrush") {
        const image = imageSourcePart(element.getAttribute("ImageSource"), ctx.base);
        if (!image) return undefined;
        ctx.state.images.add(image);
        return { kind: "image", opacity, transform, tile, viewbox, viewport, image };
      }
      const visual = resolveVisual(element, ctx);
      return visual ? { kind: "visual", opacity, transform, tile, viewbox, viewport, visual } : undefined;
    }
    default:
      return undefined;
  }
}

function resolveVisual(brush: Element, ctx: ParseContext): XpsNode | undefined {
  const key = staticKey(brush.getAttribute("Visual"));
  if (key) {
    const entry = ctx.scope.get(key);
    return entry ? parseNode(entry.element, { ...withBase(ctx, entry.base), depth: ctx.depth + 1 }) : undefined;
  }
  const value = propertyValue(brush, "Visual");
  return value ? parseNode(value, { ...ctx, depth: ctx.depth + 1 }) : undefined;
}

function resolveBrush(element: Element, attribute: string, ctx: ParseContext): Brush | undefined {
  const attr = element.getAttribute(attribute);
  if (attr) {
    const key = staticKey(attr);
    if (key) {
      const entry = ctx.scope.get(key);
      return entry ? brushFrom(entry.element, withBase(ctx, entry.base)) : undefined;
    }
    const color = parseColor(attr);
    return color ? { kind: "solid", color, opacity: 1 } : undefined;
  }
  const value = propertyValue(element, attribute);
  return value ? brushFrom(value, ctx) : undefined;
}

function common(element: Element, ctx: ParseContext): NodeCommon {
  return {
    transform: elementTransform(element, "RenderTransform", "RenderTransform", ctx),
    clip: resolveGeometry(element, "Clip", ctx),
    opacity: Math.max(0, Math.min(1, numberAttr(element, "Opacity", 1))),
    opacityMask: resolveBrush(element, "OpacityMask", ctx),
  };
}

const CAPS: Record<string, CanvasLineCap> = { Flat: "butt", Round: "round", Square: "square", Triangle: "round" };
const JOINS: Record<string, CanvasLineJoin> = { Miter: "miter", Bevel: "bevel", Round: "round" };

function strokeStyle(element: Element): StrokeStyle {
  return {
    width: Math.max(0, numberAttr(element, "StrokeThickness", 1)),
    cap: CAPS[element.getAttribute("StrokeStartLineCap") ?? "Flat"] ?? "butt",
    join: JOINS[element.getAttribute("StrokeLineJoin") ?? "Miter"] ?? "miter",
    miterLimit: Math.max(1, numberAttr(element, "StrokeMiterLimit", 10)),
    dash: numberList(element.getAttribute("StrokeDashArray")).filter((value) => value >= 0),
    dashOffset: numberAttr(element, "StrokeDashOffset", 0),
  };
}

/** Splits `Indices` + `UnicodeString` into positioned glyph specs (cluster maps included). */
export function parseGlyphRun(unicode: string, indices: string): GlyphSpec[] {
  const text = unicode.startsWith("{}") ? unicode.slice(2) : unicode;
  const out: GlyphSpec[] = [];
  let charPos = 0;
  const nextCodePoint = () => {
    if (charPos >= text.length) return undefined;
    const code = text.codePointAt(charPos)!;
    charPos += code > 0xffff ? 2 : 1;
    return code;
  };
  const entries = indices.trim() ? indices.split(";") : [];
  let clusterGlyphsLeft = 0;
  let clusterChars = 0;
  for (const raw of entries) {
    let entry = raw.trim();
    const cluster = /^\((\d+)(?::(\d+))?\)/.exec(entry);
    let codePoint: number | undefined;
    if (cluster) {
      entry = entry.slice(cluster[0].length);
      clusterChars = Number(cluster[1]);
      clusterGlyphsLeft = Number(cluster[2] ?? 1);
      codePoint = text.codePointAt(charPos);
    } else if (clusterGlyphsLeft === 0) {
      codePoint = nextCodePoint();
    }
    const [index, advance, u, v] = entry.split(",").map((field) => (field.trim() === "" ? undefined : Number(field)));
    out.push({
      index: index !== undefined && Number.isInteger(index) && index >= 0 ? index : undefined,
      codePoint,
      advance: advance !== undefined && Number.isFinite(advance) ? advance : undefined,
      u: u !== undefined && Number.isFinite(u) ? u : 0,
      v: v !== undefined && Number.isFinite(v) ? v : 0,
    });
    if (clusterGlyphsLeft > 0 && --clusterGlyphsLeft === 0) charPos += clusterChars;
  }
  for (let code = nextCodePoint(); code !== undefined; code = nextCodePoint()) out.push({ codePoint: code, u: 0, v: 0 });
  return out;
}

function parseGlyphs(element: Element, ctx: ParseContext): XpsNode | undefined {
  const fontUri = element.getAttribute("FontUri");
  const font = fontUri ? resolvePart(ctx.base, fontUri) : undefined;
  const size = numberAttr(element, "FontRenderingEmSize", 0);
  if (!font || !(size > 0)) return undefined;
  const unicode = element.getAttribute("UnicodeString") ?? "";
  const glyphs = parseGlyphRun(unicode, element.getAttribute("Indices") ?? "");
  ctx.state.glyphs += glyphs.length;
  if (ctx.state.glyphs > XPS_LIMITS.pageGlyphs) throw new XpsLimitError("Too many glyphs on one page.");
  const face = Number.parseInt(uriFragment(fontUri ?? "") ?? "0", 10) || 0;
  ctx.state.fonts.add(`${font}#${face}`);
  const simulations = element.getAttribute("StyleSimulations") ?? "None";
  return {
    kind: "glyphs",
    ...common(element, ctx),
    font: `${font}#${face}`,
    size,
    x: numberAttr(element, "OriginX", 0),
    y: numberAttr(element, "OriginY", 0),
    text: unicode.startsWith("{}") ? unicode.slice(2) : unicode,
    glyphs,
    rtl: Number.parseInt(element.getAttribute("BidiLevel") ?? "0", 10) % 2 === 1,
    bold: simulations.includes("Bold"),
    italic: simulations.includes("Italic"),
    fill: resolveBrush(element, "Fill", ctx),
  };
}

function parseNode(element: Element, ctx: ParseContext): XpsNode | undefined {
  if (ctx.depth > XPS_LIMITS.nestingDepth) throw new XpsLimitError("FixedPage nesting is too deep.");
  if (++ctx.state.nodes > XPS_LIMITS.pageNodes) throw new XpsLimitError("Too many elements on one page.");
  switch (element.localName) {
    case "Canvas": {
      const scope = addResources(childNamed(element, "Canvas.Resources"), ctx);
      const inner: ParseContext = { ...ctx, scope, depth: ctx.depth + 1 };
      return { kind: "canvas", ...common(element, inner), children: parseChildren(element, inner) };
    }
    case "Path": {
      const geometry = resolveGeometry(element, "Data", ctx);
      if (!geometry?.d) return undefined;
      const fill = resolveBrush(element, "Fill", ctx);
      const stroke = resolveBrush(element, "Stroke", ctx);
      if (!fill && !stroke) return undefined;
      return { kind: "path", ...common(element, ctx), geometry, fill, stroke, strokeStyle: strokeStyle(element) };
    }
    case "Glyphs":
      return parseGlyphs(element, ctx);
    default:
      return undefined;
  }
}

function parseChildren(element: Element, ctx: ParseContext) {
  const out: XpsNode[] = [];
  for (const child of elementChildren(element)) {
    if (child.localName.includes(".")) continue; // property elements
    const node = parseNode(child, ctx);
    if (node) out.push(node);
  }
  return out;
}

/** Converts a parsed `<FixedPage>` into a renderer-independent display tree. */
export function buildPage(root: Element, pagePart: string, dictionaries: ReadonlyMap<string, Element>): XpsPage {
  const state = { nodes: 0, glyphs: 0, fonts: new Set<string>(), images: new Set<string>() };
  const base: ParseContext = { base: pagePart, scope: new ResourceScope(), depth: 0, state, dictionaries };
  const ctx: ParseContext = { ...base, scope: addResources(childNamed(root, "FixedPage.Resources"), base) };
  const width = numberAttr(root, "Width", 0);
  const height = numberAttr(root, "Height", 0);
  const children = parseChildren(root, ctx);
  return {
    width: width > 0 ? width : 816,
    height: height > 0 ? height : 1056,
    root: { kind: "canvas", opacity: 1, children },
    fonts: state.fonts,
    images: state.images,
  };
}
