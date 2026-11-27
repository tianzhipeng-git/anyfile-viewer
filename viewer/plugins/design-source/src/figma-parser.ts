import { inflateSync, unzipSync, unzlibSync } from "fflate";
import { decompress as zstdDecompress } from "fzstd";
import { ViewerError } from "@anyfile/viewer-protocol";
import { decodeBinarySchema, decodeKiwiMessage } from "./kiwi";
import type {
  DesignBounds,
  DesignColor,
  DesignDocument,
  DesignFill,
  DesignGradientStop,
  DesignNode,
  DesignNodeKind,
  DesignPage,
  DesignStroke,
  DesignTextInfo,
} from "./model";

const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_NODES = 60_000;
const MAX_IMAGES = 256;
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;

const FIG_MAGICS = ["fig-kiwi", "fig-jam.", "fig-deck"];
const ZIP_LOCAL_SIG = 0x04034b50;
const ZSTD_MAGIC = 0xfd2fb528;

type RawGuid = { sessionID?: number; localID?: number };
type RawMatrix = {
  m00?: number;
  m01?: number;
  m02?: number;
  m10?: number;
  m11?: number;
  m12?: number;
};

type RawFigmaNode = Record<string, unknown> & {
  guid?: RawGuid;
  parentIndex?: { guid?: RawGuid; position?: string };
  type?: string;
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  size?: { x?: number; y?: number };
  transform?: RawMatrix;
  cornerRadius?: number;
  frameMaskDisabled?: boolean;
  internalOnly?: boolean;
  fillPaints?: unknown[];
  strokePaints?: unknown[];
  strokeWeight?: number;
  backgroundColor?: Record<string, unknown>;
  backgroundEnabled?: boolean;
  textData?: { characters?: string };
  fontName?: { family?: string; style?: string };
  fontSize?: number;
  lineHeight?: { value?: number; units?: string };
  letterSpacing?: { value?: number; units?: string };
  textAlignHorizontal?: string;
};

function uint32LE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16) |
      ((bytes[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i] ?? 0);
  }
  return out;
}

function decompressFigChunk(chunk: Uint8Array): Uint8Array {
  if (chunk.length >= 4 && uint32LE(chunk, 0) === ZSTD_MAGIC) {
    const out = zstdDecompress(chunk);
    if (out.byteLength > MAX_UNCOMPRESSED_BYTES) {
      throw new ViewerError("resource-limit", "Decompressed Figma chunk exceeds limit");
    }
    return out;
  }
  // Try raw deflate first (standard for fig-kiwi), then zlib fallback
  try {
    const out = inflateSync(chunk);
    if (out.byteLength > MAX_UNCOMPRESSED_BYTES) {
      throw new ViewerError("resource-limit", "Decompressed Figma chunk exceeds limit");
    }
    return out;
  } catch (error) {
    if (error instanceof ViewerError) throw error;
    const out = unzlibSync(chunk);
    if (out.byteLength > MAX_UNCOMPRESSED_BYTES) {
      throw new ViewerError("resource-limit", "Decompressed Figma chunk exceeds limit");
    }
    return out;
  }
}

function guidKey(guid: RawGuid | undefined): string | null {
  if (!guid || typeof guid.sessionID !== "number" || typeof guid.localID !== "number") {
    return null;
  }
  return `${guid.sessionID}:${guid.localID}`;
}

function parseColor(raw: unknown): DesignColor | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.r !== "number" || typeof c.g !== "number" || typeof c.b !== "number") {
    return undefined;
  }
  return {
    r: c.r,
    g: c.g,
    b: c.b,
    a: typeof c.a === "number" ? c.a : 1,
  };
}

function hashBytesToHex(hash: unknown): string | undefined {
  if (hash instanceof Uint8Array) {
    return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  if (Array.isArray(hash)) {
    return hash.map((b) => Number(b).toString(16).padStart(2, "0")).join("");
  }
  return undefined;
}

function parsePaints(rawPaints: unknown): DesignFill[] {
  if (!Array.isArray(rawPaints)) return [];
  const fills: DesignFill[] = [];
  for (const item of rawPaints) {
    if (!item || typeof item !== "object") continue;
    const paint = item as Record<string, unknown>;
    if (paint.visible === false) continue;
    const opacity = typeof paint.opacity === "number" ? paint.opacity : 1;
    const type = String(paint.type ?? "");
    if (type === "SOLID") {
      const color = parseColor(paint.color);
      if (color) fills.push({ type: "solid", color, opacity });
    } else if (type === "GRADIENT_LINEAR" || type === "GRADIENT_RADIAL") {
      const stopsRaw = Array.isArray(paint.stops) ? paint.stops : [];
      const stops: DesignGradientStop[] = [];
      for (const s of stopsRaw) {
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
        fills.push({
          type: type === "GRADIENT_RADIAL" ? "radial-gradient" : "linear-gradient",
          stops,
          opacity,
        });
      }
    } else if (type === "IMAGE") {
      const imageObj = paint.image as Record<string, unknown> | undefined;
      const hash = hashBytesToHex(imageObj?.hash);
      if (hash) {
        fills.push({ type: "image", imageRef: `images/${hash}`, opacity });
      }
    }
  }
  return fills;
}

function parseStrokes(rawPaints: unknown, weight: unknown): DesignStroke[] {
  if (!Array.isArray(rawPaints)) return [];
  const strokeWidth = typeof weight === "number" && weight > 0 ? weight : 1;
  const strokes: DesignStroke[] = [];
  for (const item of rawPaints) {
    if (!item || typeof item !== "object") continue;
    const paint = item as Record<string, unknown>;
    if (paint.visible === false) continue;
    const color = parseColor(paint.color);
    if (color) {
      strokes.push({
        color,
        width: strokeWidth,
        opacity: typeof paint.opacity === "number" ? paint.opacity : 1,
      });
    }
  }
  return strokes;
}

function mapFigmaKind(rawType: string): DesignNodeKind {
  switch (rawType) {
    case "CANVAS":
      return "page";
    case "FRAME":
    case "SECTION":
      return "frame";
    case "GROUP":
    case "BOOLEAN_OPERATION":
      return "group";
    case "RECTANGLE":
    case "ROUNDED_RECTANGLE":
      return "rectangle";
    case "ELLIPSE":
      return "ellipse";
    case "LINE":
      return "line";
    case "VECTOR":
    case "STAR":
    case "REGULAR_POLYGON":
      return "vector";
    case "TEXT":
      return "text";
    case "SYMBOL":
    case "COMPONENT":
    case "COMPONENT_SET":
      return "component";
    case "INSTANCE":
      return "instance";
    default:
      return "other";
  }
}

function parseTextAlign(raw: unknown): DesignTextInfo["align"] {
  switch (String(raw ?? "")) {
    case "CENTER":
      return "center";
    case "RIGHT":
      return "right";
    case "JUSTIFIED":
      return "justify";
    default:
      return "left";
  }
}

function extractRawCanvas(bytes: Uint8Array): {
  canvasBytes: Uint8Array;
  meta?: Record<string, unknown>;
  thumbnail?: Uint8Array;
  images: Map<string, Uint8Array>;
} {
  const images = new Map<string, Uint8Array>();

  if (bytes.length >= 16 && FIG_MAGICS.includes(ascii(bytes, 0, 8))) {
    return { canvasBytes: bytes, images };
  }

  if (bytes.length < 4 || uint32LE(bytes, 0) !== ZIP_LOCAL_SIG) {
    throw new ViewerError("invalid-file", "Not a valid Figma archive or fig-kiwi stream");
  }

  let totalUncompressed = 0;
  let totalImageBytes = 0;
  const entries = unzipSync(bytes, {
    filter(file) {
      totalUncompressed += file.originalSize;
      if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
        throw new ViewerError("resource-limit", "Figma archive exceeds uncompressed limit");
      }
      const name = file.name.replace(/^\/+/, "");
      if (name === "canvas.fig" || name === "meta.json" || name === "thumbnail.png") {
        return true;
      }
      if (name.startsWith("images/") && file.originalSize > 0) {
        if (images.size >= MAX_IMAGES || totalImageBytes + file.originalSize > MAX_TOTAL_IMAGE_BYTES) {
          return false;
        }
        totalImageBytes += file.originalSize;
        return true;
      }
      return false;
    },
  });

  let canvasBytes: Uint8Array | undefined;
  let meta: Record<string, unknown> | undefined;
  let thumbnail: Uint8Array | undefined;

  for (const [rawName, data] of Object.entries(entries)) {
    const name = rawName.replace(/^\/+/, "");
    if (name === "canvas.fig") {
      canvasBytes = data;
    } else if (name === "meta.json") {
      try {
        meta = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
      } catch {
        // ignore malformed meta.json
      }
    } else if (name === "thumbnail.png") {
      thumbnail = data;
    } else if (name.startsWith("images/") && data.byteLength > 0) {
      images.set(name, data);
    }
  }

  if (!canvasBytes) {
    if (thumbnail) {
      return { canvasBytes: new Uint8Array(0), meta, thumbnail, images };
    }
    throw new ViewerError("invalid-file", "Figma archive is missing canvas.fig");
  }

  return { canvasBytes, meta, thumbnail, images };
}

export function parseFigmaDocument(bytes: Uint8Array, fileName: string): DesignDocument {
  const { canvasBytes, meta, thumbnail, images } = extractRawCanvas(bytes);
  const fallbackTitle =
    (typeof meta?.file_name === "string" && meta.file_name.trim()) ||
    fileName.replace(/\.fig$/i, "");
  const exportedAt = typeof meta?.exported_at === "string" ? meta.exported_at : undefined;

  if (canvasBytes.byteLength === 0 && thumbnail) {
    return {
      format: "figma",
      title: fallbackTitle,
      version: "preview-only",
      exportedAt,
      thumbnail,
      pages: [],
      images,
      fonts: [],
      stats: { pageCount: 0, artboardCount: 0, nodeCount: 0, textNodeCount: 0, imageCount: images.size },
    };
  }

  if (canvasBytes.byteLength < 16 || !FIG_MAGICS.includes(ascii(canvasBytes, 0, 8))) {
    throw new ViewerError("invalid-file", "Invalid canvas.fig header");
  }

  const version = uint32LE(canvasBytes, 8);
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 4 <= canvasBytes.byteLength && chunks.length < 4) {
    const chunkLen = uint32LE(canvasBytes, offset);
    offset += 4;
    if (chunkLen === 0 || offset + chunkLen > canvasBytes.byteLength) {
      throw new ViewerError("invalid-file", "Truncated chunk in canvas.fig");
    }
    chunks.push(canvasBytes.subarray(offset, offset + chunkLen));
    offset += chunkLen;
  }

  if (chunks.length < 2) {
    throw new ViewerError("invalid-file", "Figma canvas.fig missing schema or data chunk");
  }

  let schemaBytes: Uint8Array;
  let dataBytes: Uint8Array;
  try {
    schemaBytes = decompressFigChunk(chunks[0]!);
    dataBytes = decompressFigChunk(chunks[1]!);
  } catch (error) {
    if (error instanceof ViewerError) throw error;
    throw new ViewerError("invalid-file", "Failed to decompress Figma chunks", { cause: error });
  }

  let message: Record<string, unknown>;
  try {
    const schema = decodeBinarySchema(schemaBytes);
    message = decodeKiwiMessage(schema, "Message", dataBytes);
  } catch (error) {
    throw new ViewerError("invalid-file", "Failed to decode Figma Kiwi message", { cause: error });
  }

  const rawChanges = Array.isArray(message.nodeChanges)
    ? (message.nodeChanges as RawFigmaNode[])
    : [];
  if (rawChanges.length > MAX_NODES) {
    throw new ViewerError("resource-limit", "Figma document exceeds maximum node budget");
  }

  const nodeMap = new Map<string, RawFigmaNode>();
  const childrenByParent = new Map<string, Array<{ id: string; position: string }>>();

  for (const node of rawChanges) {
    const id = guidKey(node.guid);
    if (!id) continue;
    nodeMap.set(id, node);
    const parentId = guidKey(node.parentIndex?.guid);
    if (parentId) {
      let list = childrenByParent.get(parentId);
      if (!list) {
        list = [];
        childrenByParent.set(parentId, list);
      }
      list.push({ id, position: String(node.parentIndex?.position ?? "") });
    }
  }

  for (const list of childrenByParent.values()) {
    list.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  }

  const fontsSet = new Set<string>();
  let totalNodes = 0;
  let textNodeCount = 0;

  const buildNode = (
    id: string,
    parentAbsX: number,
    parentAbsY: number,
    isTopLevelOnPage: boolean,
    depth: number,
  ): DesignNode | null => {
    if (depth > 48) return null;
    const raw = nodeMap.get(id);
    if (!raw) return null;

    totalNodes += 1;
    const rawType = String(raw.type ?? "NONE");
    let kind = mapFigmaKind(rawType);
    if (isTopLevelOnPage && (kind === "frame" || kind === "component")) {
      kind = "artboard";
    }

    const m = raw.transform;
    const x = typeof m?.m02 === "number" && Number.isFinite(m.m02) ? m.m02 : 0;
    const y = typeof m?.m12 === "number" && Number.isFinite(m.m12) ? m.m12 : 0;
    const width = typeof raw.size?.x === "number" && Number.isFinite(raw.size.x) ? raw.size.x : 0;
    const height = typeof raw.size?.y === "number" && Number.isFinite(raw.size.y) ? raw.size.y : 0;
    const absX = parentAbsX + x;
    const absY = parentAbsY + y;
    const rotation =
      typeof m?.m00 === "number" && typeof m?.m10 === "number"
        ? Math.round((Math.atan2(m.m10, m.m00) * 180) / Math.PI)
        : 0;

    const fills = parsePaints(raw.fillPaints);
    if (fills.length === 0 && raw.backgroundEnabled && raw.backgroundColor) {
      const bg = parseColor(raw.backgroundColor);
      if (bg) fills.push({ type: "solid", color: bg, opacity: 1 });
    }
    const strokes = parseStrokes(raw.strokePaints, raw.strokeWeight);

    let text: DesignTextInfo | undefined;
    if (kind === "text") {
      textNodeCount += 1;
      const content = typeof raw.textData?.characters === "string" ? raw.textData.characters : "";
      const fontFamily = typeof raw.fontName?.family === "string" ? raw.fontName.family : undefined;
      const fontStyle = typeof raw.fontName?.style === "string" ? raw.fontName.style : undefined;
      if (fontFamily) fontsSet.add(fontFamily);
      const firstSolidFill = fills.find((f) => f.type === "solid");
      let lineHeight: number | undefined;
      if (typeof raw.lineHeight?.value === "number" && raw.lineHeight.value > 0) {
        lineHeight =
          raw.lineHeight.units === "PERCENT" && typeof raw.fontSize === "number"
            ? (raw.fontSize * raw.lineHeight.value) / 100
            : raw.lineHeight.value;
      }
      text = {
        content,
        fontFamily,
        fontStyle,
        fontSize: typeof raw.fontSize === "number" ? raw.fontSize : undefined,
        lineHeight,
        letterSpacing: typeof raw.letterSpacing?.value === "number" ? raw.letterSpacing.value : undefined,
        align: parseTextAlign(raw.textAlignHorizontal),
        color: firstSolidFill?.type === "solid" ? firstSolidFill.color : undefined,
      };
    }

    const imageFill = fills.find((f) => f.type === "image");
    const childEntries = childrenByParent.get(id) ?? [];
    const children: DesignNode[] = [];
    for (const childRef of childEntries) {
      const childNode = buildNode(childRef.id, absX, absY, false, depth + 1);
      if (childNode) children.push(childNode);
    }

    const bounds: DesignBounds = { x, y, width, height };
    const absBounds: DesignBounds = { x: absX, y: absY, width, height };

    return {
      id,
      name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : rawType,
      kind,
      rawType,
      visible: raw.visible !== false,
      locked: raw.locked === true,
      opacity: typeof raw.opacity === "number" ? Math.min(1, Math.max(0, raw.opacity)) : 1,
      bounds,
      absBounds,
      rotation,
      cornerRadius: typeof raw.cornerRadius === "number" ? Math.max(0, raw.cornerRadius) : 0,
      clipsContent: kind === "artboard" || (kind === "frame" && raw.frameMaskDisabled !== true),
      fills,
      strokes,
      text,
      imageRef: imageFill?.type === "image" ? imageFill.imageRef : undefined,
      children,
    };
  };

  // Find DOCUMENT root and its CANVAS pages
  let docNode: RawFigmaNode | undefined;
  let docId: string | undefined;
  for (const [id, node] of nodeMap.entries()) {
    if (node.type === "DOCUMENT") {
      docNode = node;
      docId = id;
      break;
    }
  }

  const canvasIds: string[] = [];
  if (docId) {
    for (const child of childrenByParent.get(docId) ?? []) {
      const candidate = nodeMap.get(child.id);
      if (candidate?.type === "CANVAS") {
        canvasIds.push(child.id);
      }
    }
  }
  if (canvasIds.length === 0) {
    for (const [id, node] of nodeMap.entries()) {
      if (node.type === "CANVAS") canvasIds.push(id);
    }
  }

  const nonInternalCanvases = canvasIds.filter((id) => nodeMap.get(id)?.internalOnly !== true);
  const selectedCanvasIds = nonInternalCanvases.length > 0 ? nonInternalCanvases : canvasIds;

  const pages: DesignPage[] = [];
  let artboardCount = 0;

  for (const canvasId of selectedCanvasIds) {
    const rawPage = nodeMap.get(canvasId)!;
    const childEntries = childrenByParent.get(canvasId) ?? [];
    const rootNodes: DesignNode[] = [];
    const artboards: DesignNode[] = [];
    for (const childRef of childEntries) {
      const built = buildNode(childRef.id, 0, 0, true, 0);
      if (!built) continue;
      rootNodes.push(built);
      if (built.kind === "artboard") {
        artboards.push(built);
        artboardCount += 1;
      }
    }
    pages.push({
      id: canvasId,
      name: typeof rawPage.name === "string" && rawPage.name.length > 0 ? rawPage.name : "Page",
      backgroundColor: parseColor(rawPage.backgroundColor),
      artboards,
      rootNodes,
    });
  }

  const title =
    (typeof docNode?.name === "string" && docNode.name !== "Document" && docNode.name) ||
    fallbackTitle;

  return {
    format: "figma",
    title,
    version: `Kiwi v${version}`,
    exportedAt,
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
