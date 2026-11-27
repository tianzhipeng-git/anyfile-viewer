import { colorToCss, type DesignBounds, type DesignFill, type DesignNode, type DesignPage } from "./model";

export type RenderSceneOptions = {
  readonly page: DesignPage;
  readonly focusedArtboard?: DesignNode;
  readonly selectedNodeId?: string;
  readonly images: ReadonlyMap<string, HTMLImageElement | ImageBitmap>;
  readonly contentBounds: DesignBounds;
  readonly transform: { readonly scale: number; readonly panX: number; readonly panY: number };
};

function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  if (r <= 0.5) {
    ctx.rect(x, y, width, height);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function traceNodePath(ctx: CanvasRenderingContext2D, node: DesignNode) {
  const { x, y, width, height } = node.absBounds;
  if (node.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, Math.max(0.5, width / 2), Math.max(0.5, height / 2), 0, 0, Math.PI * 2);
    return;
  }
  if (node.kind === "line") {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + width, y + height);
    return;
  }
  if (node.pathPoints && node.pathPoints.length >= 2) {
    const pts = node.pathPoints;
    const toAbs = (p: { x: number; y: number }) => ({ x: x + p.x * width, y: y + p.y * height });
    const first = toAbs(pts[0]!);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    const count = node.pathClosed ? pts.length : pts.length - 1;
    for (let i = 0; i < count; i += 1) {
      const curr = pts[i]!;
      const next = pts[(i + 1) % pts.length]!;
      const target = toAbs(next);
      if (curr.hasCurveFrom || next.hasCurveTo) {
        const cp1 = curr.hasCurveFrom && curr.curveFrom ? toAbs(curr.curveFrom) : toAbs(curr);
        const cp2 = next.hasCurveTo && next.curveTo ? toAbs(next.curveTo) : target;
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, target.x, target.y);
      } else {
        ctx.lineTo(target.x, target.y);
      }
    }
    if (node.pathClosed) ctx.closePath();
    return;
  }
  traceRoundedRect(ctx, x, y, width, height, node.cornerRadius);
}

function resolveFillStyle(
  ctx: CanvasRenderingContext2D,
  fill: DesignFill,
  bounds: DesignBounds,
): string | CanvasGradient | null {
  if (fill.type === "solid") {
    return colorToCss(fill.color, fill.opacity);
  }
  if (fill.type === "linear-gradient") {
    const grad = ctx.createLinearGradient(bounds.x, bounds.y, bounds.x, bounds.y + bounds.height);
    for (const stop of fill.stops) {
      grad.addColorStop(Math.min(1, Math.max(0, stop.position)), colorToCss(stop.color, fill.opacity));
    }
    return grad;
  }
  if (fill.type === "radial-gradient") {
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const radius = Math.max(1, Math.max(bounds.width, bounds.height) / 2);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    for (const stop of fill.stops) {
      grad.addColorStop(Math.min(1, Math.max(0, stop.position)), colorToCss(stop.color, fill.opacity));
    }
    return grad;
  }
  return null;
}

function drawTextLayer(ctx: CanvasRenderingContext2D, node: DesignNode) {
  const text = node.text;
  if (!text || !text.content) return;
  const { x, y, width, height } = node.absBounds;
  const fontSize = text.fontSize && text.fontSize > 0 ? text.fontSize : 14;
  const lineHeight = text.lineHeight && text.lineHeight > 0 ? text.lineHeight : fontSize * 1.35;
  const weight = text.fontStyle && /bold|black|heavy|semibold/i.test(text.fontStyle) ? "600" : "400";
  const italic = text.fontStyle && /italic|oblique/i.test(text.fontStyle) ? "italic " : "";
  const family = text.fontFamily ? `"${text.fontFamily.replace(/"/g, "")}", sans-serif` : "sans-serif";

  ctx.font = `${italic}${weight} ${fontSize}px ${family}`;
  ctx.textBaseline = "top";
  ctx.fillStyle = text.color ? colorToCss(text.color) : "#111827";

  const align = text.align ?? "left";
  ctx.textAlign = align === "justify" ? "left" : align;
  const anchorX =
    align === "center" ? x + width / 2 : align === "right" ? x + width : x;

  const maxW = width > 4 ? width : Number.POSITIVE_INFINITY;
  const paragraphs = text.content.split(/\r?\n/);
  let cursorY = y;
  const maxY = height > 0 ? y + height + lineHeight : Number.POSITIVE_INFINITY;

  for (const para of paragraphs) {
    if (cursorY > maxY) break;
    if (!para) {
      cursorY += lineHeight;
      continue;
    }
    if (!Number.isFinite(maxW) || ctx.measureText(para).width <= maxW) {
      ctx.fillText(para, anchorX, cursorY);
      cursorY += lineHeight;
      continue;
    }
    // Simple word/character wrap
    const tokens = para.split(/(\s+)/);
    let line = "";
    for (const token of tokens) {
      const test = line + token;
      if (line && ctx.measureText(test).width > maxW) {
        ctx.fillText(line.trimEnd(), anchorX, cursorY);
        cursorY += lineHeight;
        if (cursorY > maxY) break;
        line = token.trimStart();
      } else {
        line = test;
      }
    }
    if (line && cursorY <= maxY) {
      ctx.fillText(line.trimEnd(), anchorX, cursorY);
      cursorY += lineHeight;
    }
  }
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  node: DesignNode,
  images: ReadonlyMap<string, HTMLImageElement | ImageBitmap>,
  isRootArtboard: boolean,
  depth: number,
) {
  if (!node.visible || depth > 48) return;
  const { x, y, width, height } = node.absBounds;

  ctx.save();
  if (node.opacity < 0.999) {
    ctx.globalAlpha *= node.opacity;
  }

  if (node.rotation !== 0 && (width > 0 || height > 0)) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((node.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  if (isRootArtboard && (node.kind === "artboard" || node.kind === "component")) {
    // Draw artboard label above frame
    ctx.save();
    ctx.font = "500 12px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = "rgba(128, 128, 128, 0.9)";
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(node.name, x, y - 6);
    ctx.restore();

    // Subtle elevation frame for artboards
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.14)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 2;
    traceRoundedRect(ctx, x, y, width, height, node.cornerRadius);
    ctx.fillStyle = node.fills.length > 0 ? "transparent" : "#ffffff";
    ctx.fill();
    ctx.restore();
  }

  if (node.kind !== "group" && node.kind !== "text" && (width > 0 || height > 0)) {
    // Draw fills
    for (const fill of node.fills) {
      if (fill.type === "image") {
        const img = images.get(fill.imageRef);
        if (img) {
          ctx.save();
          traceNodePath(ctx, node);
          ctx.clip();
          ctx.globalAlpha *= fill.opacity;
          ctx.drawImage(img, x, y, width, height);
          ctx.restore();
        }
        continue;
      }
      const style = resolveFillStyle(ctx, fill, node.absBounds);
      if (style) {
        traceNodePath(ctx, node);
        ctx.fillStyle = style;
        ctx.fill();
      }
    }

    // Direct bitmap node (Sketch bitmap)
    if (node.kind === "image" && node.imageRef) {
      const img = images.get(node.imageRef);
      if (img) {
        ctx.save();
        traceNodePath(ctx, node);
        ctx.clip();
        ctx.drawImage(img, x, y, width, height);
        ctx.restore();
      } else {
        traceNodePath(ctx, node);
        ctx.fillStyle = "rgba(128, 128, 128, 0.18)";
        ctx.fill();
      }
    }

    // Draw strokes
    for (const stroke of node.strokes) {
      traceNodePath(ctx, node);
      ctx.strokeStyle = colorToCss(stroke.color, stroke.opacity);
      ctx.lineWidth = stroke.width;
      ctx.stroke();
    }
  }

  if (node.kind === "text") {
    drawTextLayer(ctx, node);
  }

  if (node.children.length > 0) {
    if (node.clipsContent && width > 0 && height > 0) {
      ctx.save();
      traceRoundedRect(ctx, x, y, width, height, node.cornerRadius);
      ctx.clip();
      for (const child of node.children) {
        drawNode(ctx, child, images, false, depth + 1);
      }
      ctx.restore();
    } else {
      for (const child of node.children) {
        drawNode(ctx, child, images, false, depth + 1);
      }
    }
  }

  ctx.restore();
}

function findNodeById(nodes: readonly DesignNode[], id: string): DesignNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNodeById(node.children, id);
    if (found) return found;
  }
  return undefined;
}

export function renderDesignScene(
  ctx: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  dpr: number,
  options: RenderSceneOptions,
) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewportWidth, viewportHeight);

  const { contentBounds, transform, page, focusedArtboard, selectedNodeId, images } = options;
  const cx = contentBounds.x + contentBounds.width / 2;
  const cy = contentBounds.y + contentBounds.height / 2;

  ctx.translate(viewportWidth / 2 + transform.panX, viewportHeight / 2 + transform.panY);
  ctx.scale(transform.scale, transform.scale);
  ctx.translate(-cx, -cy);

  const roots = focusedArtboard ? [focusedArtboard] : page.rootNodes;
  for (const root of roots) {
    drawNode(ctx, root, images, true, 0);
  }

  // Draw selection highlight & dimension badge
  if (selectedNodeId) {
    const selected = findNodeById(roots, selectedNodeId);
    if (selected) {
      const { x, y, width, height } = selected.absBounds;
      const invScale = 1 / Math.max(0.05, transform.scale);
      ctx.save();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5 * invScale;
      ctx.strokeRect(x, y, Math.max(1, width), Math.max(1, height));

      // Corner handles
      const handleSize = 5 * invScale;
      ctx.fillStyle = "#ffffff";
      for (const [hx, hy] of [
        [x, y],
        [x + width, y],
        [x, y + height],
        [x + width, y + height],
      ]) {
        ctx.fillRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(hx - handleSize / 2, hy - handleSize / 2, handleSize, handleSize);
      }

      // Dimension pill below selection
      const label = `${Math.round(width)} × ${Math.round(height)}`;
      const fontSize = 11 * invScale;
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const padX = 6 * invScale;
      const padY = 3 * invScale;
      const pillW = textWidth + padX * 2;
      const pillH = fontSize + padY * 2;
      const pillX = x + width / 2 - pillW / 2;
      const pillY = y + height + 6 * invScale;
      ctx.fillStyle = "#2563eb";
      traceRoundedRect(ctx, pillX, pillY, pillW, pillH, 4 * invScale);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2);
      ctx.restore();
    }
  }

  ctx.restore();
}

export function hitTestDesignNode(
  roots: readonly DesignNode[],
  worldX: number,
  worldY: number,
): DesignNode | undefined {
  const visit = (nodes: readonly DesignNode[]): DesignNode | undefined => {
    // Iterate in reverse paint order (topmost layer first)
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const node = nodes[i]!;
      if (!node.visible) continue;
      const { x, y, width, height } = node.absBounds;
      const inside =
        worldX >= x && worldX <= x + Math.max(0, width) && worldY >= y && worldY <= y + Math.max(0, height);
      if (node.clipsContent && !inside) continue;
      if (node.children.length > 0) {
        const hitChild = visit(node.children);
        if (hitChild) return hitChild;
      }
      if (inside && node.kind !== "group") {
        return node;
      }
    }
    return undefined;
  };
  return visit(roots);
}
