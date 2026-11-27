import { unzipSync } from "fflate";
import { ViewerError } from "@anyfile/viewer-protocol";
import type {
  DesignBounds,
  DesignColor,
  DesignDocument,
  DesignFill,
  DesignGradientStop,
  DesignNode,
  DesignNodeKind,
  DesignPage,
  DesignPathPoint,
  DesignStroke,
  DesignTextInfo,
} from "./model";

const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_NODES = 60_000;
const MAX_IMAGES = 256;
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
const ZIP_LOCAL_SIG = 0x04034b50;

function uint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function parseColor(raw: unknown): DesignColor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.red !== "number" || typeof c.green !== "number" || typeof c.blue !== "number") {
    return undefined;
  }
  return {
    r: c.red,
    g: c.green,
    b: c.blue,
    a: typeof c.alpha === "number" ? c.alpha : 1,
  };
}

function parseSketchPointString(raw: unknown): { x: number; y: number } | undefined {
  if (typeof raw !== "string") return undefined;
  const match = /^\{\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*,\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*\}$/i.exec(raw);
  if (!match) return undefined;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function parseSketchPathPoints(rawPoints: unknown): DesignPathPoint[] | undefined {
  if (!Array.isArray(rawPoints) || rawPoints.length < 2) return undefined;
  const points: DesignPathPoint[] = [];
  for (const item of rawPoints) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const pt = parseSketchPointString(obj.point);
    if (!pt) continue;
    points.push({
      x: pt.x,
      y: pt.y,
      curveFrom: parseSketchPointString(obj.curveFrom),
      curveTo: parseSketchPointString(obj.curveTo),
      hasCurveFrom: obj.hasCurveFrom === true,
      hasCurveTo: obj.hasCurveTo === true,
    });
  }
  return points.length >= 2 ? points : undefined;
}

function parseFills(rawStyle: unknown): DesignFill[] {
  if (!rawStyle || typeof rawStyle !== "object") return [];
  const style = rawStyle as Record<string, unknown>;
  const rawFills = Array.isArray(style.fills) ? style.fills : [];
  const fills: DesignFill[] = [];
  for (const item of rawFills) {
    if (!item || typeof item !== "object") continue;
    const fill = item as Record<string, unknown>;
    if (fill.isEnabled === false) continue;
    const ctx = fill.contextSettings as Record<string, unknown> | undefined;
    const opacity = typeof ctx?.opacity === "number" ? ctx.opacity : 1;
    const fillType = typeof fill.fillType === "number" ? fill.fillType : 0;
    if (fillType === 0) {
      const color = parseColor(fill.color);
      if (color) fills.push({ type: "solid", color, opacity });
    } else if (fillType === 1) {
      const gradient = fill.gradient as Record<string, unknown> | undefined;
      const rawStops = Array.isArray(gradient?.stops) ? gradient.stops : [];
      const stops: DesignGradientStop[] = [];
      for (const s of rawStops) {
        if (!s || typeof s !== "object") continue;
        const stopObj = s as Record<string, unknown>;
        const color = parseColor(stopObj.color);
        if (color) {
          stops.push({
            position: typeof stopObj.position === "number" ? stopObj.position : 0,
            color,
          });
        }
      }
      if (stops.length > 0) {
        const gradientType = gradient?.gradientType === 1 ? "radial-gradient" : "linear-gradient";
        fills.push({ type: gradientType, stops, opacity });
      }
    } else if (fillType === 4) {
      const imageObj = fill.image as Record<string, unknown> | undefined;
      if (typeof imageObj?._ref === "string") {
        fills.push({ type: "image", imageRef: imageObj._ref, opacity });
      }
    }
  }
  return fills;
}

function parseBorders(rawStyle: unknown): DesignStroke[] {
  if (!rawStyle || typeof rawStyle !== "object") return [];
  const style = rawStyle as Record<string, unknown>;
  const rawBorders = Array.isArray(style.borders) ? style.borders : [];
  const strokes: DesignStroke[] = [];
  for (const item of rawBorders) {
    if (!item || typeof item !== "object") continue;
    const border = item as Record<string, unknown>;
    if (border.isEnabled === false) continue;
    const color = parseColor(border.color);
    if (!color) continue;
    const ctx = border.contextSettings as Record<string, unknown> | undefined;
    const opacity = typeof ctx?.opacity === "number" ? ctx.opacity : 1;
    const width = typeof border.thickness === "number" && border.thickness > 0 ? border.thickness : 1;
    strokes.push({ color, width, opacity });
  }
  return strokes;
}

function mapSketchKind(rawClass: string): DesignNodeKind {
  switch (rawClass) {
    case "page":
      return "page";
    case "artboard":
      return "artboard";
    case "symbolMaster":
      return "component";
    case "symbolInstance":
      return "instance";
    case "group":
    case "shapeGroup":
      return "group";
    case "rectangle":
      return "rectangle";
    case "oval":
      return "ellipse";
    case "shapePath":
    case "star":
    case "polygon":
    case "triangle":
      return "vector";
    case "text":
      return "text";
    case "bitmap":
      return "image";
    default:
      return "other";
  }
}

function mapSketchTextAlign(raw: unknown): DesignTextInfo["align"] {
  switch (raw) {
    case 1:
      return "right";
    case 2:
      return "center";
    case 3:
      return "justify";
    default:
      return "left";
  }
}

function parseSketchText(raw: Record<string, unknown>, fontsSet: Set<string>): DesignTextInfo {
  const attrStr = raw.attributedString as Record<string, unknown> | undefined;
  const content = typeof attrStr?.string === "string" ? attrStr.string : "";
  const attributes = Array.isArray(attrStr?.attributes) ? attrStr.attributes : [];
  const firstAttr = (attributes[0] as Record<string, unknown> | undefined)?.attributes as
    | Record<string, unknown>
    | undefined;

  const fontDesc = firstAttr?.MSAttributedStringFontAttribute as Record<string, unknown> | undefined;
  const fontAttrs = fontDesc?.attributes as Record<string, unknown> | undefined;
  const fontFamily = typeof fontAttrs?.name === "string" ? fontAttrs.name : undefined;
  const fontSize = typeof fontAttrs?.size === "number" ? fontAttrs.size : undefined;
  if (fontFamily) fontsSet.add(fontFamily);

  const color = parseColor(firstAttr?.MSAttributedStringColorAttribute);
  const para = firstAttr?.paragraphStyle as Record<string, unknown> | undefined;
  const align = mapSketchTextAlign(para?.alignment);
  const lineHeight =
    typeof para?.minimumLineHeight === "number" && para.minimumLineHeight > 0
      ? para.minimumLineHeight
      : typeof para?.maximumLineHeight === "number" && para.maximumLineHeight > 0
        ? para.maximumLineHeight
        : undefined;
  const letterSpacing = typeof firstAttr?.kerning === "number" ? firstAttr.kerning : undefined;

  return { content, fontFamily, fontSize, lineHeight, letterSpacing, align, color };
}

export function parseSketchDocument(bytes: Uint8Array, fileName: string): DesignDocument {
  if (bytes.byteLength < 4 || uint32LE(bytes, 0) !== ZIP_LOCAL_SIG) {
    throw new ViewerError("invalid-file", "Not a valid Sketch ZIP archive");
  }

  let totalUncompressed = 0;
  let totalImageBytes = 0;
  const imageCountRef = { count: 0 };

  const entries = unzipSync(bytes, {
    filter(file) {
      totalUncompressed += file.originalSize;
      if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
        throw new ViewerError("resource-limit", "Sketch archive exceeds uncompressed limit");
      }
      const name = file.name.replace(/^\/+/, "");
      if (
        name === "document.json" ||
        name === "meta.json" ||
        name === "previews/preview.png" ||
        /^pages\/[^/]+\.json$/i.test(name)
      ) {
        return true;
      }
      if (name.startsWith("images/") && file.originalSize > 0) {
        if (
          imageCountRef.count >= MAX_IMAGES ||
          totalImageBytes + file.originalSize > MAX_TOTAL_IMAGE_BYTES
        ) {
          return false;
        }
        imageCountRef.count += 1;
        totalImageBytes += file.originalSize;
        return true;
      }
      return false;
    },
  });

  const decoder = new TextDecoder();
  const readJson = (path: string): Record<string, unknown> | undefined => {
    const data = entries[path];
    if (!data) return undefined;
    try {
      return JSON.parse(decoder.decode(data)) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  };

  const docJson = readJson("document.json");
  const metaJson = readJson("meta.json");
  if (!docJson && !metaJson) {
    throw new ViewerError("invalid-file", "Sketch archive missing document.json and meta.json");
  }

  const thumbnail = entries["previews/preview.png"];
  const images = new Map<string, Uint8Array>();
  for (const [rawName, data] of Object.entries(entries)) {
    const name = rawName.replace(/^\/+/, "");
    if (name.startsWith("images/") && data.byteLength > 0) {
      images.set(name, data);
    }
  }

  // Determine ordered page paths
  const pagePaths: string[] = [];
  const docPages = Array.isArray(docJson?.pages) ? docJson.pages : [];
  for (const ref of docPages) {
    if (!ref || typeof ref !== "object") continue;
    const refStr = (ref as Record<string, unknown>)._ref;
    if (typeof refStr === "string") {
      const fullPath = refStr.endsWith(".json") ? refStr : `${refStr}.json`;
      if (entries[fullPath]) pagePaths.push(fullPath);
    }
  }
  if (pagePaths.length === 0) {
    for (const key of Object.keys(entries).sort()) {
      if (/^pages\/[^/]+\.json$/i.test(key)) {
        pagePaths.push(key);
      }
    }
  }

  const fontsSet = new Set<string>();
  if (Array.isArray(metaJson?.fonts)) {
    for (const f of metaJson.fonts) {
      if (typeof f === "string" && f.length > 0) fontsSet.add(f);
    }
  }

  let totalNodes = 0;
  let textNodeCount = 0;
  let artboardCount = 0;

  const buildLayer = (
    raw: Record<string, unknown>,
    parentAbsX: number,
    parentAbsY: number,
    depth: number,
  ): DesignNode | null => {
    if (depth > 48) return null;
    totalNodes += 1;
    if (totalNodes > MAX_NODES) {
      throw new ViewerError("resource-limit", "Sketch document exceeds maximum layer budget");
    }

    const rawType = typeof raw._class === "string" ? raw._class : "layer";
    const kind = mapSketchKind(rawType);
    const id = typeof raw.do_objectID === "string" ? raw.do_objectID : `layer-${totalNodes}`;
    const name = typeof raw.name === "string" && raw.name.length > 0 ? raw.name : rawType;

    const frame = raw.frame as Record<string, unknown> | undefined;
    const x = typeof frame?.x === "number" && Number.isFinite(frame.x) ? frame.x : 0;
    const y = typeof frame?.y === "number" && Number.isFinite(frame.y) ? frame.y : 0;
    const width = typeof frame?.width === "number" && Number.isFinite(frame.width) ? frame.width : 0;
    const height = typeof frame?.height === "number" && Number.isFinite(frame.height) ? frame.height : 0;
    const absX = parentAbsX + x;
    const absY = parentAbsY + y;

    const style = raw.style as Record<string, unknown> | undefined;
    const ctx = style?.contextSettings as Record<string, unknown> | undefined;
    const opacity = typeof ctx?.opacity === "number" ? Math.min(1, Math.max(0, ctx.opacity)) : 1;

    const fills = parseFills(style);
    if ((kind === "artboard" || kind === "component") && raw.hasBackgroundColor === true) {
      const bg = parseColor(raw.backgroundColor);
      if (bg) {
        fills.unshift({ type: "solid", color: bg, opacity: 1 });
      }
    }
    const strokes = parseBorders(style);

    let text: DesignTextInfo | undefined;
    if (kind === "text") {
      textNodeCount += 1;
      text = parseSketchText(raw, fontsSet);
    }

    let imageRef: string | undefined;
    if (kind === "image") {
      const img = raw.image as Record<string, unknown> | undefined;
      if (typeof img?._ref === "string") {
        imageRef = img._ref;
      }
    }

    const pathPoints = parseSketchPathPoints(raw.points);
    const pathClosed = raw.isClosed !== false;

    const rawChildren = Array.isArray(raw.layers) ? raw.layers : [];
    const children: DesignNode[] = [];
    for (const item of rawChildren) {
      if (!item || typeof item !== "object") continue;
      const child = buildLayer(item as Record<string, unknown>, absX, absY, depth + 1);
      if (child) children.push(child);
    }

    const bounds: DesignBounds = { x, y, width, height };
    const absBounds: DesignBounds = { x: absX, y: absY, width, height };

    return {
      id,
      name,
      kind,
      rawType,
      visible: raw.isVisible !== false,
      locked: raw.isLocked === true,
      opacity,
      bounds,
      absBounds,
      rotation: typeof raw.rotation === "number" ? -raw.rotation : 0,
      cornerRadius: typeof raw.fixedRadius === "number" ? Math.max(0, raw.fixedRadius) : 0,
      clipsContent: kind === "artboard" || kind === "component",
      fills,
      strokes,
      text,
      imageRef,
      pathPoints,
      pathClosed,
      children,
    };
  };

  const pages: DesignPage[] = [];
  for (const path of pagePaths) {
    const pageJson = readJson(path);
    if (!pageJson) continue;
    const rawLayers = Array.isArray(pageJson.layers) ? pageJson.layers : [];
    const rootNodes: DesignNode[] = [];
    const artboards: DesignNode[] = [];

    for (const item of rawLayers) {
      if (!item || typeof item !== "object") continue;
      const built = buildLayer(item as Record<string, unknown>, 0, 0, 0);
      if (!built) continue;
      rootNodes.push(built);
      if (built.kind === "artboard" || built.kind === "component") {
        artboards.push(built);
        artboardCount += 1;
      }
    }

    pages.push({
      id: typeof pageJson.do_objectID === "string" ? pageJson.do_objectID : path,
      name: typeof pageJson.name === "string" && pageJson.name.length > 0 ? pageJson.name : "Page",
      artboards,
      rootNodes,
    });
  }

  const appVersion = typeof metaJson?.appVersion === "string" ? metaJson.appVersion : undefined;
  const formatVersion = typeof metaJson?.version === "number" ? `v${metaJson.version}` : undefined;
  const version = appVersion
    ? `Sketch ${appVersion}${formatVersion ? ` (${formatVersion})` : ""}`
    : formatVersion ?? "Sketch";

  return {
    format: "sketch",
    title: fileName.replace(/\.sketch$/i, ""),
    version,
    thumbnail,
    pages,
    images,
    fonts: Array.from(fontsSet).sort(),
    stats: {
      pageCount: pages.length,
      artboardCount,
      nodeCount: totalNodes,
      textNodeCount,
      imageCount: images.size,
    },
  };
}
