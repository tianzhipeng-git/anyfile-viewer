import type { GlyphOutlineFont } from "@anyfile/viewer-rendering/fixed-layout";

import type { PageAssets } from "./assets";
import type { Paint } from "./color";
import type { Matrix } from "./geometry";
import type { ClipPath, LineStyle, NodePaint, OfdNode, OfdPage, PatternPaint } from "./model";

type Ctx = CanvasRenderingContext2D;
type TextNode = Extract<OfdNode, { kind: "text" }>;

/** Synthetic italic shear (≈11°), matching browsers' oblique fallback. */
const ITALIC_SLANT = 0.2;
/** Fallback text is drawn at 100px and scaled down so tiny millimetre sizes stay legible. */
const FALLBACK_EM = 100;
const MAX_TILE_SIDE = 2048;

const pathCache = new WeakMap<object, Path2D>();
const glyphCache = new WeakMap<GlyphOutlineFont, Map<number, Path2D | null>>();

function domMatrix(m: Matrix) {
  return new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]);
}

function nodePath(owner: { d: string; transform?: Matrix }) {
  let path = pathCache.get(owner);
  if (!path) {
    path = new Path2D(owner.d);
    if (owner.transform) {
      const transformed = new Path2D();
      transformed.addPath(path, domMatrix(owner.transform));
      path = transformed;
    }
    pathCache.set(owner, path);
  }
  return path;
}

function glyphPath(font: GlyphOutlineFont, glyph: number) {
  let cache = glyphCache.get(font);
  if (!cache) glyphCache.set(font, (cache = new Map()));
  let path = cache.get(glyph);
  if (path === undefined) {
    const d = font.outline(glyph);
    path = d ? new Path2D(d) : null;
    cache.set(glyph, path);
  }
  return path;
}

function gradientStyle(ctx: Ctx, paint: Paint): string | CanvasGradient {
  if (paint.kind === "color") return paint.color;
  const gradient =
    paint.kind === "axial"
      ? ctx.createLinearGradient(paint.start[0], paint.start[1], paint.end[0], paint.end[1])
      : ctx.createRadialGradient(paint.start[0], paint.start[1], paint.startRadius, paint.end[0], paint.end[1], paint.endRadius);
  for (const stop of paint.stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

/** One device pixel expressed in the current user space. */
function devicePixel(ctx: Ctx) {
  const m = ctx.getTransform();
  const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
  return scale > 0 ? 1 / scale : 1;
}

function applyLine(ctx: Ctx, line: LineStyle) {
  ctx.lineWidth = Math.max(line.width, devicePixel(ctx));
  ctx.lineCap = line.cap;
  ctx.lineJoin = line.join;
  ctx.miterLimit = Math.max(1, line.miterLimit);
  if (line.dash.length && line.dash.some((value) => value > 0)) {
    ctx.setLineDash([...line.dash]);
    ctx.lineDashOffset = line.dashOffset;
  }
}

function applyClips(ctx: Ctx, clips: readonly ClipPath[]) {
  for (const clip of clips) ctx.clip(nodePath(clip), clip.rule);
}

class Painter {
  constructor(private readonly assets: Omit<PageAssets, "release">) {}

  private style(ctx: Ctx, paint: NodePaint): string | CanvasGradient | CanvasPattern {
    return paint.kind === "pattern" ? (this.pattern(ctx, paint) ?? "transparent") : gradientStyle(ctx, paint);
  }

  /** Renders one pattern cell at device resolution and repeats it in the pattern space. */
  private pattern(ctx: Ctx, paint: PatternPaint) {
    const m = ctx.getTransform().multiply(paint.ctm ? domMatrix(paint.ctm) : new DOMMatrix());
    const tileW = Math.max(1, Math.min(MAX_TILE_SIDE, Math.ceil(paint.xStep * Math.hypot(m.a, m.b))));
    const tileH = Math.max(1, Math.min(MAX_TILE_SIDE, Math.ceil(paint.yStep * Math.hypot(m.c, m.d))));
    const tile = document.createElement("canvas");
    tile.width = tileW;
    tile.height = tileH;
    const tileCtx = tile.getContext("2d");
    if (!tileCtx) return undefined;
    tileCtx.scale(tileW / paint.xStep, tileH / paint.yStep);
    for (const node of paint.cell) this.node(tileCtx, node, 1);
    const pattern = ctx.createPattern(tile, "repeat");
    pattern?.setTransform((paint.ctm ? domMatrix(paint.ctm) : new DOMMatrix()).scale(paint.xStep / tileW, paint.yStep / tileH));
    return pattern ?? undefined;
  }

  node(ctx: Ctx, node: OfdNode, alpha: number) {
    const opacity = alpha * node.alpha;
    if (opacity <= 0) return;
    ctx.save();
    try {
      if (node.offset) ctx.translate(node.offset[0], node.offset[1]);
      if (node.clips) applyClips(ctx, node.clips);
      if (node.ctm) ctx.transform(...node.ctm);
      ctx.globalAlpha = opacity;
      this.content(ctx, node, opacity);
    } finally {
      ctx.restore();
    }
  }

  private content(ctx: Ctx, node: OfdNode, opacity: number) {
    switch (node.kind) {
      case "group":
        for (const child of node.children) this.node(ctx, child, opacity);
        return;
      case "path": {
        const path = nodePath(node);
        if (node.fill) {
          ctx.fillStyle = this.style(ctx, node.fill);
          ctx.fill(path, node.rule);
        }
        if (node.stroke) {
          applyLine(ctx, node.line);
          ctx.strokeStyle = this.style(ctx, node.stroke);
          ctx.stroke(path);
        }
        return;
      }
      case "text":
        this.text(ctx, node);
        return;
      case "image": {
        const image = this.assets.images.get(node.part);
        if (image) ctx.drawImage(image.source, 0, 0, 1, 1);
        return;
      }
      case "stamp": {
        const seal = this.assets.seals.get(node.seal);
        if (seal) ctx.drawImage(seal.source, 0, 0, node.width, node.height);
        return;
      }
    }
  }

  private text(ctx: Ctx, node: TextNode) {
    const font = node.font ? this.assets.fonts.get(node.font) : undefined;
    const run = new Path2D();
    let outlined = false;
    if (node.fill) ctx.fillStyle = this.style(ctx, node.fill);
    if (node.stroke) {
      applyLine(ctx, node.line);
      ctx.strokeStyle = this.style(ctx, node.stroke);
    }
    for (const glyph of node.glyphs) {
      const id = glyph.index ?? (font && glyph.text ? font.glyphIndex(glyph.text.codePointAt(0)!) : 0);
      const outline = font && (id || glyph.index !== undefined) ? glyphPath(font, id) : undefined;
      if (outline) {
        const scale = node.size / font!.unitsPerEm;
        const matrix = new DOMMatrix()
          .translateSelf(glyph.x, glyph.y)
          .rotateSelf(node.rotation)
          .multiplySelf(new DOMMatrix([scale * node.hScale, 0, node.italic ? scale * ITALIC_SLANT : 0, -scale, 0, 0]));
        run.addPath(outline, matrix);
        outlined = true;
      } else if (outline === undefined && glyph.text.trim()) {
        this.fallbackGlyph(ctx, node, glyph.x, glyph.y, glyph.text);
      }
    }
    if (!outlined) return;
    if (node.fill) ctx.fill(run);
    if (node.stroke) ctx.stroke(run);
  }

  /** Missing / CFF / unmapped glyphs are drawn with a system font of the declared family. */
  private fallbackGlyph(ctx: Ctx, node: TextNode, x: number, y: number, text: string) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((node.rotation * Math.PI) / 180);
    const k = node.size / FALLBACK_EM;
    ctx.scale(k * node.hScale, k);
    ctx.font = `${node.italic ? "italic " : ""}${node.bold ? "bold " : ""}${FALLBACK_EM}px ${node.family}`;
    ctx.textBaseline = "alphabetic";
    if (node.fill) ctx.fillText(text, 0, 0);
    if (node.stroke) {
      ctx.lineWidth /= k;
      ctx.strokeText(text, 0, 0);
    }
    ctx.restore();
  }
}

/**
 * Paints a page onto `ctx`; the caller sets the device transform (millimetres → pixels).
 * Seal appearances pass `transparent` so only their marks cover the host page.
 */
export function paintPage(ctx: Ctx, page: OfdPage, assets: Omit<PageAssets, "release">, transparent = false) {
  ctx.save();
  if (!transparent) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, page.width, page.height);
  }
  ctx.beginPath();
  ctx.rect(0, 0, page.width, page.height);
  ctx.clip();
  new Painter(assets).node(ctx, page.root, 1);
  ctx.restore();
}
