import { attrLocal, childNamed, elementChildren, numberList } from "./xml";

/** Affine matrix `[m11, m12, m21, m22, offsetX, offsetY]` (same order as canvas `transform()`). */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export interface Geometry {
  /** SVG-compatible path data. */
  readonly d: string;
  readonly fillRule: CanvasFillRule;
  readonly transform?: Matrix;
}

export function parseMatrix(value: string | null | undefined): Matrix | undefined {
  const numbers = numberList(value);
  return numbers.length === 6 ? (numbers as unknown as Matrix) : undefined;
}

/** `a` applied first, then `b`. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * XPS abbreviated geometry is SVG path syntax plus an optional leading fill-rule
 * command (`F0` even-odd, the default, or `F1` non-zero).
 */
export function parseAbbreviatedGeometry(data: string, transform?: Matrix): Geometry {
  const match = /^\s*F\s*([01])/i.exec(data);
  const d = match ? data.slice(match[0].length) : data;
  return { d: d.trim(), fillRule: match?.[1] === "1" ? "nonzero" : "evenodd", transform };
}

function points(value: string | null) {
  const numbers = numberList(value);
  const out: string[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) out.push(`${numbers[i]},${numbers[i + 1]}`);
  return out;
}

function segmentData(segment: Element) {
  const list = points(segment.getAttribute("Points") ?? segment.getAttribute("Point"));
  switch (segment.localName) {
    case "PolyLineSegment":
      return list.length ? `L ${list.join(" ")}` : "";
    case "PolyBezierSegment":
      return list.length >= 3 ? `C ${list.slice(0, list.length - (list.length % 3)).join(" ")}` : "";
    case "PolyQuadraticBezierSegment":
      return list.length >= 2 ? `Q ${list.slice(0, list.length - (list.length % 2)).join(" ")}` : "";
    case "ArcSegment": {
      const size = numberList(segment.getAttribute("Size"));
      if (!list[0] || size.length !== 2) return "";
      const large = segment.getAttribute("IsLargeArc") === "true" ? 1 : 0;
      const sweep = segment.getAttribute("SweepDirection") === "Clockwise" ? 1 : 0;
      const rotation = Number.parseFloat(segment.getAttribute("RotationAngle") ?? "0") || 0;
      return `A ${size[0]},${size[1]} ${rotation} ${large} ${sweep} ${list[0]}`;
    }
    default:
      return "";
  }
}

/** Converts a `<PathGeometry>` element (attribute and/or child figures) to SVG path data. */
export function parsePathGeometry(element: Element, resolveTransform: (value: string) => Matrix | undefined): Geometry {
  const parts: string[] = [];
  const figures = attrLocal(element, "Figures");
  let fillRule: CanvasFillRule = element.getAttribute("FillRule") === "NonZero" ? "nonzero" : "evenodd";
  if (figures) {
    const abbreviated = parseAbbreviatedGeometry(figures);
    parts.push(abbreviated.d);
    if (!element.hasAttribute("FillRule")) fillRule = abbreviated.fillRule;
  }
  for (const figure of elementChildren(element).filter((node) => node.localName === "PathFigure")) {
    const start = points(figure.getAttribute("StartPoint"))[0];
    if (!start) continue;
    let d = `M ${start}`;
    for (const segment of elementChildren(figure)) d += ` ${segmentData(segment)}`;
    if (figure.getAttribute("IsClosed") === "true") d += " Z";
    parts.push(d);
  }
  const transformAttr = element.getAttribute("Transform");
  const transformElement = childNamed(element, "PathGeometry.Transform");
  const matrixElement = transformElement ? elementChildren(transformElement)[0] : undefined;
  const transform = transformAttr
    ? resolveTransform(transformAttr)
    : matrixElement
      ? parseMatrix(matrixElement.getAttribute("Matrix"))
      : undefined;
  return { d: parts.join(" ").trim(), fillRule, transform };
}
