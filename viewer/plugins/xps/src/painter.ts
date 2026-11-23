import type { GlyphOutlineFont } from "./font";
import type { Geometry, Matrix } from "./geometry";
import { ITALIC_SLANT, type Brush, type GradientStop, type Rect, type XpsNode, type XpsPage } from "./model";
import type { XpsImage } from "./resources";

export interface PaintResources {
  readonly fonts: ReadonlyMap<string, GlyphOutlineFont | null>;
  readonly images: ReadonlyMap<string, XpsImage | null>;
}

type Ctx = CanvasRenderingContext2D;

const MAX_TILE_SIDE = 2048;
const FALLBACK_FONT = 'Arial, "Helvetica Neue", "Noto Sans", "PingFang SC", "Microsoft YaHei", sans-serif';

const geometryCache = new WeakMap<Geometry, Path2D>();
const glyphCache = new WeakMap<GlyphOutlineFont, Map<number, Path2D | null>>();

function domMatrix(m: Matrix) {
  return new DOMMatrix([m[0], m[1], m[2], m[3], m[4], m[5]]);
}

function toPath(geometry: Geometry) {
  let path = geometryCache.get(geometry);
  if (!path) {
    path = new Path2D(geometry.d);
    if (geometry.transform) {
      const transformed = new Path2D();
      transformed.addPath(path, domMatrix(geometry.transform));
      path = transformed;
    }
    geometryCache.set(geometry, path);
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

function createLayer(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  return canvas;
}

/** The current clip region (whole canvas) mapped back into the current user space. */
function userBounds(ctx: Ctx): Rect | undefined {
  const matrix = ctx.getTransform();
  if (!matrix.is2D || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-12) return undefined;
  const inverse = matrix.inverse();
  const { width, height } = ctx.canvas;
  const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) => inverse.transformPoint({ x, y }));
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function addStops(gradient: CanvasGradient, stops: readonly GradientStop[]) {
  for (const stop of stops) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}

class Painter {
  private layerDepth = 0;

  constructor(private readonly resources: PaintResources) {}

  node(ctx: Ctx, node: XpsNode, alpha: number) {
    const opacity = alpha * node.opacity;
    if (opacity <= 0) return;
    ctx.save();
    try {
      if (node.transform) ctx.transform(...node.transform);
      if (node.clip) ctx.clip(toPath(node.clip), node.clip.fillRule);
      if (node.opacityMask && this.layerDepth === 0) this.masked(ctx, node, opacity, node.opacityMask);
      else this.content(ctx, node, opacity);
    } finally {
      ctx.restore();
    }
  }

  private masked(ctx: Ctx, node: XpsNode, opacity: number, mask: Brush) {
    const layer = createLayer(ctx.canvas.width, ctx.canvas.height);
    const layerCtx = layer.getContext("2d");
    if (!layerCtx) return this.content(ctx, node, opacity);
    this.layerDepth += 1;
    try {
      layerCtx.setTransform(ctx.getTransform());
      this.content(layerCtx, node, opacity);
      layerCtx.globalCompositeOperation = "destination-in";
      this.brushArea(layerCtx, mask, 1);
    } finally {
      this.layerDepth -= 1;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    layer.width = 0;
  }

  private content(ctx: Ctx, node: XpsNode, opacity: number) {
    switch (node.kind) {
      case "canvas":
        for (const child of node.children) this.node(ctx, child, opacity);
        return;
      case "path": {
        const path = toPath(node.geometry);
        if (node.fill) this.fill(ctx, path, node.geometry.fillRule, node.fill, opacity);
        if (node.stroke && node.strokeStyle.width > 0) {
          const style = node.strokeStyle;
          ctx.lineWidth = style.width;
          ctx.lineCap = style.cap;
          ctx.lineJoin = style.join;
          ctx.miterLimit = style.miterLimit;
          if (style.dash.length && style.dash.some((value) => value > 0)) {
            ctx.setLineDash(style.dash.map((value) => value * style.width));
            ctx.lineDashOffset = style.dashOffset * style.width;
          }
          this.stroke(ctx, path, node.stroke, opacity);
        }
        return;
      }
      case "glyphs":
        this.glyphs(ctx, node, opacity);
        return;
    }
  }

  private fill(ctx: Ctx, path: Path2D, rule: CanvasFillRule, brush: Brush, opacity: number) {
    if (brush.kind === "solid") {
      ctx.globalAlpha = opacity * brush.opacity;
      ctx.fillStyle = brush.color;
      ctx.fill(path, rule);
      return;
    }
    ctx.save();
    ctx.clip(path, rule);
    this.brushArea(ctx, brush, opacity);
    ctx.restore();
  }

  private stroke(ctx: Ctx, path: Path2D, brush: Brush, opacity: number) {
    if (brush.kind === "solid") {
      ctx.globalAlpha = opacity * brush.opacity;
      ctx.strokeStyle = brush.color;
      ctx.stroke(path);
      return;
    }
    // Canvas cannot clip to a stroke outline: draw it as a mask on a layer and paint the brush into it.
    const layer = createLayer(ctx.canvas.width, ctx.canvas.height);
    const layerCtx = layer.getContext("2d");
    if (!layerCtx) return;
    layerCtx.setTransform(ctx.getTransform());
    for (const key of ["lineWidth", "lineCap", "lineJoin", "miterLimit", "lineDashOffset"] as const) {
      (layerCtx as unknown as Record<string, unknown>)[key] = ctx[key];
    }
    layerCtx.setLineDash(ctx.getLineDash());
    layerCtx.stroke(path);
    layerCtx.globalCompositeOperation = "source-in";
    this.brushArea(layerCtx, brush, 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = opacity;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    layer.width = 0;
  }

  /** Paints `brush` over the whole current clip region. */
  private brushArea(ctx: Ctx, brush: Brush, opacity: number) {
    ctx.save();
    try {
      ctx.globalAlpha = opacity * brush.opacity;
      if (brush.transform) ctx.transform(...brush.transform);
      if (brush.kind === "solid") {
        ctx.fillStyle = brush.color;
      } else if (brush.kind === "linear") {
        ctx.fillStyle = addStops(ctx.createLinearGradient(brush.start[0], brush.start[1], brush.end[0], brush.end[1]), brush.stops);
      } else if (brush.kind === "radial") {
        if (!(brush.radiusX > 0) || !(brush.radiusY > 0)) {
          ctx.fillStyle = brush.stops.at(-1)!.color;
        } else {
          const ratio = brush.radiusY / brush.radiusX;
          ctx.translate(brush.center[0], brush.center[1]);
          ctx.scale(1, ratio);
          const ox = brush.origin[0] - brush.center[0];
          const oy = (brush.origin[1] - brush.center[1]) / ratio;
          ctx.fillStyle = addStops(ctx.createRadialGradient(ox, oy, 0, 0, 0, brush.radiusX), brush.stops);
        }
      } else {
        this.tiles(ctx, brush);
        return;
      }
      const area = userBounds(ctx);
      if (area) ctx.fillRect(area.x, area.y, area.width, area.height);
    } finally {
      ctx.restore();
    }
  }

  private tileContent(brush: Extract<Brush, { kind: "image" | "visual" }>) {
    const { viewbox } = brush;
    if (!(viewbox.width > 0) || !(viewbox.height > 0)) return undefined;
    if (brush.kind === "image") {
      const image = this.resources.images.get(brush.image);
      if (!image) return undefined;
      const sx = image.pixelWidth / image.width;
      const sy = image.pixelHeight / image.height;
      return (target: Ctx, x: number, y: number, w: number, h: number) => {
        target.drawImage(image.source, viewbox.x * sx, viewbox.y * sy, viewbox.width * sx, viewbox.height * sy, x, y, w, h);
      };
    }
    return (target: Ctx, x: number, y: number, w: number, h: number) => {
      target.save();
      target.beginPath();
      target.rect(x, y, w, h);
      target.clip();
      target.transform(w / viewbox.width, 0, 0, h / viewbox.height, x - (viewbox.x * w) / viewbox.width, y - (viewbox.y * h) / viewbox.height);
      this.node(target, brush.visual, 1);
      target.restore();
    };
  }

  private tiles(ctx: Ctx, brush: Extract<Brush, { kind: "image" | "visual" }>) {
    const { viewport } = brush;
    const draw = this.tileContent(brush);
    if (!draw || !(viewport.width > 0) || !(viewport.height > 0)) return;
    if (brush.tile === "None") {
      draw(ctx, viewport.x, viewport.y, viewport.width, viewport.height);
      return;
    }
    const m = ctx.getTransform();
    const tileW = Math.max(1, Math.min(MAX_TILE_SIDE, Math.ceil(viewport.width * Math.hypot(m.a, m.b))));
    const tileH = Math.max(1, Math.min(MAX_TILE_SIDE, Math.ceil(viewport.height * Math.hypot(m.c, m.d))));
    const flipX = brush.tile === "FlipX" || brush.tile === "FlipXY";
    const flipY = brush.tile === "FlipY" || brush.tile === "FlipXY";
    const tile = createLayer(tileW * (flipX ? 2 : 1), tileH * (flipY ? 2 : 1));
    const tileCtx = tile.getContext("2d");
    if (!tileCtx) return;
    for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      if ((fx && !flipX) || (fy && !flipY)) continue;
      tileCtx.save();
      tileCtx.translate(fx ? tileW * 2 : 0, fy ? tileH * 2 : 0);
      tileCtx.scale(fx ? -1 : 1, fy ? -1 : 1);
      draw(tileCtx, 0, 0, tileW, tileH);
      tileCtx.restore();
    }
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return;
    pattern.setTransform(new DOMMatrix([viewport.width / tileW, 0, 0, viewport.height / tileH, viewport.x, viewport.y]));
    ctx.fillStyle = pattern;
    const area = userBounds(ctx);
    if (area) ctx.fillRect(area.x, area.y, area.width, area.height);
  }

  private glyphs(ctx: Ctx, node: Extract<XpsNode, { kind: "glyphs" }>, opacity: number) {
    const brush = node.fill;
    if (!brush) return;
    const font = this.resources.fonts.get(node.font);
    const em = node.size;
    let x = node.x;
    if (!font) {
      // Unsupported (e.g. CFF) or missing font: approximate with a system font.
      ctx.globalAlpha = opacity * brush.opacity;
      ctx.fillStyle = brush.kind === "solid" ? brush.color : "#000";
      ctx.font = `${node.bold ? "bold " : ""}${node.italic ? "italic " : ""}${em}px ${FALLBACK_FONT}`;
      for (const glyph of node.glyphs) {
        const char = glyph.codePoint === undefined ? "" : String.fromCodePoint(glyph.codePoint);
        const advance = glyph.advance !== undefined ? (glyph.advance * em) / 100 : ctx.measureText(char).width;
        if (node.rtl) x -= advance;
        if (char) ctx.fillText(char, x + (glyph.u * em) / 100, node.y - (glyph.v * em) / 100);
        if (!node.rtl) x += advance;
      }
      return;
    }
    const scale = em / font.unitsPerEm;
    const skew = node.italic ? scale * ITALIC_SLANT : 0;
    const run = new Path2D();
    for (const glyph of node.glyphs) {
      const id = glyph.index ?? (glyph.codePoint === undefined ? 0 : font.glyphIndex(glyph.codePoint));
      const advance = glyph.advance !== undefined ? (glyph.advance * em) / 100 : font.advance(id) * scale;
      if (node.rtl) x -= advance;
      const path = glyphPath(font, id);
      if (path) run.addPath(path, new DOMMatrix([scale, 0, skew, -scale, x + (glyph.u * em) / 100, node.y - (glyph.v * em) / 100]));
      if (!node.rtl) x += advance;
    }
    this.fill(ctx, run, "nonzero", brush, opacity);
    if (node.bold) {
      ctx.lineWidth = em * 0.02;
      ctx.lineJoin = "round";
      this.stroke(ctx, run, brush, opacity);
    }
  }
}

/** Paints a page onto `ctx`; the caller sets the device transform (page units → pixels). */
export function paintPage(ctx: Ctx, page: XpsPage, resources: PaintResources) {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.beginPath();
  ctx.rect(0, 0, page.width, page.height);
  ctx.clip();
  new Painter(resources).node(ctx, page.root, 1);
  ctx.restore();
}
