import DxfParser from "dxf-parser";

export interface CadPoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface CadBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export type CadPrimitive =
  | {
      readonly kind: "line";
      readonly points: readonly [CadPoint, CadPoint];
      readonly color: string;
      readonly layer: string;
    }
  | {
      readonly kind: "polyline";
      readonly points: readonly CadPoint[];
      readonly closed: boolean;
      readonly color: string;
      readonly layer: string;
    }
  | {
      readonly kind: "text";
      readonly position: CadPoint;
      readonly text: string;
      readonly height: number;
      readonly rotation: number;
      readonly color: string;
      readonly layer: string;
    }
  | {
      readonly kind: "solid";
      readonly points: readonly CadPoint[];
      readonly color: string;
      readonly layer: string;
    }
  | {
      readonly kind: "point";
      readonly position: CadPoint;
      readonly color: string;
      readonly layer: string;
    };

export interface CadScene {
  readonly primitives: readonly CadPrimitive[];
  readonly bounds: CadBounds;
  readonly entityCount: number;
  readonly layerCount: number;
  readonly layers: Readonly<Record<string, boolean>>;
  readonly units?: number;
}

const MAX_ENTITIES = 200_000;
const MAX_BLOCK_DEPTH = 10;
const FULL_CIRCLE_SEGMENTS = 72;
const MIN_ARC_SEGMENTS = 12;
const MAX_ARC_SEGMENTS = 128;

const ACI_COLORS = [
  "#000000",
  "#ff0000",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#0000ff",
  "#ff00ff",
  "#ffffff",
  "#808080",
  "#c0c0c0",
];

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, sz: 1, tz: 0 };

interface Transform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
  readonly sz: number;
  readonly tz: number;
}

interface CadVertex {
  readonly x?: number;
  readonly y?: number;
  readonly z?: number;
  readonly bulge?: number;
}

interface CadEntity {
  readonly type?: string;
  readonly layer?: string;
  readonly visible?: boolean;
  readonly colorIndex?: number;
  readonly color?: number;
  readonly shape?: boolean;
  readonly closed?: boolean;
  readonly vertices?: readonly CadVertex[];
  readonly points?: readonly CadPoint[];
  readonly center?: CadPoint;
  readonly radius?: number;
  readonly startAngle?: number;
  readonly endAngle?: number;
  readonly majorAxisEndPoint?: CadPoint;
  readonly axisRatio?: number;
  readonly startPoint?: CadPoint;
  readonly endPoint?: CadPoint;
  readonly position?: CadPoint;
  readonly textHeight?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly text?: string;
  readonly name?: string;
  readonly xScale?: number;
  readonly yScale?: number;
  readonly zScale?: number;
  readonly controlPoints?: readonly CadPoint[];
  readonly fitPoints?: readonly CadPoint[];
  readonly middleOfText?: CadPoint;
  readonly insertionPoint?: CadPoint;
}

type LayerMap = Record<string, { colorIndex?: number; color?: number; frozen?: boolean; visible?: boolean }>;

function finite(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function point(value: unknown): CadPoint {
  const raw = (value ?? {}) as { x?: number; y?: number; z?: number };
  if ([raw.x, raw.y, raw.z].some(value => value !== undefined && !Number.isFinite(value))) throw new Error("Invalid DXF coordinate");
  return { x: raw.x ?? 0, y: raw.y ?? 0, z: raw.z ?? 0 };
}

function applyTransform(transform: Transform, value: CadPoint): CadPoint {
  return {
    x: transform.a * value.x + transform.b * value.y + transform.e,
    y: transform.c * value.x + transform.d * value.y + transform.f,
    z: transform.sz * (value.z ?? 0) + transform.tz,
  };
}

function compose(parent: Transform, child: Transform): Transform {
  return {
    a: parent.a * child.a + parent.b * child.c,
    b: parent.a * child.b + parent.b * child.d,
    c: parent.c * child.a + parent.d * child.c,
    d: parent.c * child.b + parent.d * child.d,
    e: parent.a * child.e + parent.b * child.f + parent.e,
    f: parent.c * child.e + parent.d * child.f + parent.f,
    sz: parent.sz * child.sz,
    tz: parent.sz * child.tz + parent.tz,
  };
}

function insertTransform(insert: CadEntity): Transform {
  const rotation = (finite(insert.rotation, 0) * Math.PI) / 180;
  const scaleX = finite(insert.xScale, 1);
  const scaleY = finite(insert.yScale, 1);
  const position = point(insert.position);
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    a: scaleX * cos,
    b: -scaleY * sin,
    c: scaleX * sin,
    d: scaleY * cos,
    e: position.x,
    f: position.y,
    sz: finite(insert.zScale, 1),
    tz: position.z ?? 0,
  };
}

function rgbCss(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `#${(number & 0xffffff).toString(16).padStart(6, "0")}`;
}

function aciCss(index: number) {
  if (index >= 1 && index < ACI_COLORS.length) return ACI_COLORS[index];
  return "";
}

function layerColor(layer: { colorIndex?: number; color?: number } | undefined) {
  if (!layer) return "#111111";
  const indexed = aciCss(Number(layer.colorIndex));
  if (indexed) return indexed;
  const trueColor = rgbCss(layer.color);
  return trueColor || "#111111";
}

function entityColor(entity: CadEntity, layers: LayerMap, blockColor?: string) {
  const colorIndex = finite(entity.colorIndex, Number.NaN);
  if (colorIndex === 0 && blockColor) return blockColor;
  if (colorIndex === 0 || colorIndex === 256) return layerColor(layers[entity.layer ?? ""]);
  if (Number.isFinite(colorIndex)) {
    const indexed = aciCss(Math.abs(colorIndex));
    if (indexed) return indexed;
  }
  const trueColor = rgbCss(entity.color);
  return trueColor || layerColor(layers[entity.layer ?? ""]);
}

function extendBounds(bounds: CadBounds, value: CadPoint) {
  return {
    minX: Math.min(bounds.minX, value.x),
    minY: Math.min(bounds.minY, value.y),
    maxX: Math.max(bounds.maxX, value.x),
    maxY: Math.max(bounds.maxY, value.y),
    width: Math.max(1, Math.max(bounds.maxX, value.x) - Math.min(bounds.minX, value.x)),
    height: Math.max(1, Math.max(bounds.maxY, value.y) - Math.min(bounds.minY, value.y)),
  };
}

function sampleAngles(start: number, end: number, minimum: number) {
  let sweep = end - start;
  if (sweep === 0) sweep = Math.PI * 2;
  if (sweep < 0) sweep += Math.PI * 2;
  const segments = Math.max(minimum, Math.min(MAX_ARC_SEGMENTS, Math.ceil((sweep / (Math.PI * 2)) * FULL_CIRCLE_SEGMENTS)));
  return { sweep, segments };
}

function sampleArc(center: CadPoint, radius: number, startAngle: number, endAngle: number) {
  const radiusValue = Math.max(0, finite(radius, 0));
  const { sweep, segments } = sampleAngles(finite(startAngle, 0), finite(endAngle, Math.PI * 2), MIN_ARC_SEGMENTS);
  const result: CadPoint[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = finite(startAngle, 0) + (sweep * index) / segments;
    result.push({
      x: center.x + Math.cos(angle) * radiusValue,
      y: center.y + Math.sin(angle) * radiusValue,
      z: center.z ?? 0,
    });
  }
  return result;
}

function sampleBulgeArc(start: CadPoint, end: CadPoint, bulge: number) {
  const bulgeValue = finite(bulge, 0);
  if (bulgeValue === 0) return [start, end];
  const theta = 4 * Math.atan(bulgeValue);
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (!Number.isFinite(chord) || chord === 0) return [start, end];
  const radius = (chord * (1 + bulgeValue * bulgeValue)) / Math.abs(4 * bulgeValue);
  const centerFactor = (1 - bulgeValue * bulgeValue) / (4 * bulgeValue);
  const center = {
    x: (start.x + end.x) / 2 - (end.y - start.y) * centerFactor,
    y: (start.y + end.y) / 2 + (end.x - start.x) * centerFactor,
  };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const result: CadPoint[] = [];
  const segments = Math.max(MIN_ARC_SEGMENTS, Math.min(MAX_ARC_SEGMENTS, Math.ceil(Math.abs(theta) / (Math.PI / 18))));
  for (let index = 0; index <= segments; index += 1) {
    const angle = startAngle + (theta * index) / segments;
    result.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius, z: (start.z ?? 0) + ((end.z ?? 0) - (start.z ?? 0)) * index / segments });
  }
  return result;
}

function flattenPolyline(vertices: readonly CadVertex[], closed: boolean) {
  const points: CadPoint[] = [];
  for (let index = 0; index < vertices.length; index += 1) {
    const current = point(vertices[index]);
    if (index === 0) {
      points.push(current);
      continue;
    }
    const previous = point(vertices[index - 1]);
    const sampled = sampleBulgeArc(previous, current, finite(vertices[index - 1]?.bulge, 0));
    points.push(...sampled.slice(1));
  }
  if (closed && points.length > 2) {
    const sampled = sampleBulgeArc(point(vertices[vertices.length - 1]), point(vertices[0]), finite(vertices[vertices.length - 1]?.bulge, 0));
    points.push(...sampled.slice(1, -1));
  }
  return points;
}

function sampleEllipse(entity: CadEntity) {
  const center = point(entity.center);
  const major = point(entity.majorAxisEndPoint);
  const ratio = finite(entity.axisRatio, 1);
  const start = finite(entity.startAngle, 0);
  const end = finite(entity.endAngle, Math.PI * 2);
  const minor = { x: -major.y * ratio, y: major.x * ratio };
  const { sweep, segments } = sampleAngles(start, end, MIN_ARC_SEGMENTS);
  const result: CadPoint[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = start + (sweep * index) / segments;
    result.push({
      x: center.x + major.x * Math.cos(angle) + minor.x * Math.sin(angle),
      y: center.y + major.y * Math.cos(angle) + minor.y * Math.sin(angle),
      z: (center.z ?? 0) + (major.z ?? 0) * Math.cos(angle),
    });
  }
  return result;
}

function cleanMtext(value: unknown) {
  const source = String(value ?? "");
  return source
    .replace(/\\[A-Za-z][^;]*;/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\\P/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCadScene(source: string): CadScene | undefined {
  let parsed: ReturnType<DxfParser["parseSync"]>;
  try {
    parsed = new DxfParser().parseSync(source);
  } catch {
    return undefined;
  }
  if (!parsed) return undefined;

  const layers = (parsed.tables?.layer?.layers ?? {}) as LayerMap;
  const blocks = parsed.blocks ?? {};
  const primitives: CadPrimitive[] = [];
  let entityCount = 0;
  let vertexCount = 0;
  let bounds: CadBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 1, height: 1 };
  let hasGeometry = false;

  const addPoint = (value: CadPoint) => {
    if (!hasGeometry) {
      bounds = { minX: value.x, minY: value.y, maxX: value.x, maxY: value.y, width: 1, height: 1 };
      hasGeometry = true;
    } else {
      bounds = extendBounds(bounds, value);
    }
  };

  const addPoints = (values: readonly CadPoint[]) => {
    for (const value of values) addPoint(value);
  };

  const addPrimitive = (primitive: CadPrimitive) => {
    vertexCount += "points" in primitive ? primitive.points.length : 1;
    if (vertexCount > 3_000_000) throw new RangeError("DXF geometry budget exceeded.");
    primitives.push(primitive);
    switch (primitive.kind) {
      case "line":
        addPoints(primitive.points);
        break;
      case "polyline":
        addPoints(primitive.points);
        break;
      case "solid":
        addPoints(primitive.points);
        break;
      case "point":
        addPoint(primitive.position);
        break;
      case "text":
        addPoint(primitive.position);
        break;
    }
  };

  const mapVertex = (value: CadVertex, transform: Transform, base: CadPoint) =>
    applyTransform(transform, { x: point(value).x - base.x, y: point(value).y - base.y, z: (point(value).z ?? 0) - (base.z ?? 0) });

  const addPolyline = (vertices: readonly CadVertex[], closed: boolean, transform: Transform, base: CadPoint, entity: CadEntity, color: string) => {
    const points = flattenPolyline(vertices, closed).map((value) => applyTransform(transform, { x: value.x - base.x, y: value.y - base.y, z: (value.z ?? 0) - (base.z ?? 0) }));
    if (points.length >= 2) addPrimitive({ kind: "polyline", points, closed, color, layer: entity.layer ?? "" });
  };

  const collect = (entities: readonly CadEntity[], transform: Transform, base: CadPoint, depth: number, blockLayer = "", blockColor?: string) => {
    if (depth > MAX_BLOCK_DEPTH) return;
    for (const rawEntity of entities) {
      const entity = (!rawEntity.layer || rawEntity.layer === "0") && blockLayer ? { ...rawEntity, layer: blockLayer } : rawEntity;
      entityCount += 1;
      if (entityCount > MAX_ENTITIES) throw new RangeError("DXF contains too many entities.");
      if (entity.visible === false) continue;
      const type = entity.type?.toUpperCase();
      const color = entityColor(entity, layers, blockColor);
      const layerName = entity.layer ?? "";

      switch (type) {
        case "LINE": {
          const vertices = (entity.vertices ?? []) as CadPoint[];
          if (vertices.length >= 2) {
            addPrimitive({
              kind: "line",
              points: [mapVertex(vertices[0], transform, base), mapVertex(vertices[1], transform, base)],
              color,
              layer: layerName,
            });
          }
          break;
        }
        case "LWPOLYLINE":
          addPolyline((entity.vertices ?? []) as CadVertex[], Boolean(entity.shape), transform, base, entity, color);
          break;
        case "POLYLINE":
          addPolyline((entity.vertices ?? []) as CadVertex[], Boolean(entity.shape), transform, base, entity, color);
          break;
        case "CIRCLE": {
          const center = point(entity.center);
          const points = sampleArc(center, finite(entity.radius, 0), 0, Math.PI * 2).map((value) => applyTransform(transform, { x: value.x - base.x, y: value.y - base.y, z: (value.z ?? 0) - (base.z ?? 0) }));
          if (points.length >= 2) addPrimitive({ kind: "polyline", points, closed: true, color, layer: layerName });
          break;
        }
        case "ARC": {
          const points = sampleArc(point(entity.center), finite(entity.radius, 0), finite(entity.startAngle, 0), finite(entity.endAngle, 0)).map((value) => applyTransform(transform, { x: value.x - base.x, y: value.y - base.y, z: (value.z ?? 0) - (base.z ?? 0) }));
          if (points.length >= 2) addPrimitive({ kind: "polyline", points, closed: false, color, layer: layerName });
          break;
        }
        case "ELLIPSE": {
          const points = sampleEllipse(entity).map((value) => applyTransform(transform, { x: value.x - base.x, y: value.y - base.y, z: (value.z ?? 0) - (base.z ?? 0) }));
          if (points.length >= 2) addPrimitive({ kind: "polyline", points, closed: Math.abs(finite(entity.endAngle, Math.PI * 2) - finite(entity.startAngle, 0)) >= Math.PI * 2 - 1e-9, color, layer: layerName });
          break;
        }
        case "TEXT":
        case "MTEXT":
        case "ATTDEF": {
          const positionValue = entity.startPoint ?? entity.position;
          const textValue = cleanMtext(entity.text);
          if (textValue) {
            addPrimitive({
              kind: "text",
              position: mapVertex(point(positionValue), transform, base),
              text: textValue,
              height: Math.max(0.5, finite(entity.textHeight ?? entity.height, 2.5)),
              rotation: finite(entity.rotation, 0),
              color,
              layer: layerName,
            });
          }
          break;
        }
        case "POINT":
          addPrimitive({ kind: "point", position: mapVertex(point(entity.position), transform, base), color, layer: layerName });
          break;
        case "SOLID":
        case "3DFACE": {
          const points = (entity.points ?? entity.vertices ?? []).map((value) => mapVertex(value as CadPoint, transform, base));
          if (points.length >= 3) addPrimitive({ kind: "solid", points, color, layer: layerName });
          break;
        }
        case "SPLINE": {
          const vertices = (entity.controlPoints ?? entity.fitPoints ?? []).map((value) => mapVertex(value as CadPoint, transform, base));
          if (vertices.length >= 2) addPrimitive({ kind: "polyline", points: vertices, closed: Boolean(entity.closed), color, layer: layerName });
          break;
        }
        case "DIMENSION": {
          const textValue = cleanMtext(entity.text);
          if (textValue) {
            addPrimitive({
              kind: "text",
              position: mapVertex(point(entity.middleOfText ?? entity.insertionPoint), transform, base),
              text: textValue,
              height: Math.max(0.5, finite(entity.textHeight ?? entity.height, 2.5)),
              rotation: finite(entity.rotation, 0),
              color,
              layer: layerName,
            });
          }
          break;
        }
        case "INSERT": {
          const block = blocks[entity.name ?? ""] as { position?: CadPoint; entities?: readonly CadEntity[] } | undefined;
          if (!block || !block.entities?.length) break;
          const position = point(entity.position);
          const child = compose(transform, insertTransform({ ...entity, position: { x: position.x - base.x, y: position.y - base.y, z: (position.z ?? 0) - (base.z ?? 0) } }));
          collect(block.entities, child, point(block.position), depth + 1, layerName, color);
          break;
        }
        default:
          break;
      }
    }
  };

  collect((parsed.entities ?? []) as CadEntity[], IDENTITY, { x: 0, y: 0 }, 0);

  return {
    primitives,
    bounds: {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
      width: Math.max(Number.EPSILON, bounds.maxX - bounds.minX),
      height: Math.max(Number.EPSILON, bounds.maxY - bounds.minY),
    },
    entityCount,
    layerCount: Object.keys(layers).length,
    layers: Object.fromEntries(Object.entries(layers).map(([name, layer]) => [name, !layer.frozen && layer.visible !== false && (layer.colorIndex ?? 1) >= 0])),
    units: typeof parsed.header?.$INSUNITS === "number" ? parsed.header.$INSUNITS : undefined,
  };
}
