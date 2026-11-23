import type { ColorSpaceDef, ResourceTable } from "./res";
import { child, children, numberAttr, numbers } from "./xml";

export interface GradientStop {
  readonly offset: number;
  readonly color: string;
}

export type Paint =
  | { readonly kind: "color"; readonly color: string }
  | {
      readonly kind: "axial";
      readonly start: readonly [number, number];
      readonly end: readonly [number, number];
      readonly stops: readonly GradientStop[];
    }
  | {
      readonly kind: "radial";
      readonly start: readonly [number, number];
      readonly end: readonly [number, number];
      readonly startRadius: number;
      readonly endRadius: number;
      readonly stops: readonly GradientStop[];
    };

export const BLACK: Paint = { kind: "color", color: "rgba(0,0,0,1)" };

function components(value: string | null) {
  return (value ?? "")
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((token) => (token.startsWith("#") ? Number.parseInt(token.slice(1), 16) : Number(token)))
    .map((item) => (Number.isFinite(item) ? item : 0));
}

const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** CSS colour of an OFD `CT_Color` value in its colour space (default 8-bit RGB). */
export function colorToCss(element: Element, space: ColorSpaceDef | undefined, alpha = 1): string {
  const max = 2 ** Math.max(1, Math.min(16, space?.bits ?? 8)) - 1;
  let values = components(element.getAttribute("Value"));
  const index = numberAttr(element, "Index");
  if (!values.length && index !== undefined && space?.palette[index]) values = [...space.palette[index]!];
  const scaled = values.map((value) => (value / max) * 255);
  let rgb: number[];
  if (space?.type === "GRAY") {
    rgb = [scaled[0] ?? 0, scaled[0] ?? 0, scaled[0] ?? 0];
  } else if (space?.type === "CMYK") {
    const [c = 0, m = 0, y = 0, k = 0] = scaled.map((value) => value / 255);
    rgb = [255 * (1 - c) * (1 - k), 255 * (1 - m) * (1 - k), 255 * (1 - y) * (1 - k)];
  } else {
    rgb = [scaled[0] ?? 0, scaled[1] ?? 0, scaled[2] ?? 0];
  }
  const a = Math.max(0, Math.min(255, numberAttr(element, "Alpha") ?? 255)) / 255;
  return `rgba(${rgb.map(clamp).join(",")},${Math.round(a * alpha * 1000) / 1000})`;
}

function point(value: string | null): [number, number] {
  const list = numbers(value);
  return [list[0] ?? 0, list[1] ?? 0];
}

function stops(shading: Element, resources: ResourceTable, fallbackSpace: ColorSpaceDef | undefined) {
  const segments = children(shading, "Segment");
  const result: GradientStop[] = [];
  segments.forEach((segment, index) => {
    const color = child(segment, "Color");
    if (!color) return;
    const position = numberAttr(segment, "Position") ?? (segments.length > 1 ? index / (segments.length - 1) : 0);
    const space = resources.get("colorSpaces", color.getAttribute("ColorSpace")) ?? fallbackSpace;
    result.push({ offset: Math.max(0, Math.min(1, position)), color: colorToCss(color, space) });
  });
  return result.sort((a, b) => a.offset - b.offset);
}

/**
 * Converts a `FillColor` / `StrokeColor` element to a paint. Axial and radial shadings map to
 * canvas gradients (always extended); tiling patterns are handled by the page model.
 */
export function parsePaint(element: Element | undefined, resources: ResourceTable): Paint | undefined {
  if (!element) return undefined;
  const space = resources.get("colorSpaces", element.getAttribute("ColorSpace"));
  const axial = child(element, "AxialShd");
  const radial = child(element, "RadialShd");
  const shading = axial ?? radial;
  if (shading) {
    const list = stops(shading, resources, space);
    if (!list.length) return undefined;
    if (list.length === 1) return { kind: "color", color: list[0]!.color };
    const start = point(shading.getAttribute("StartPoint"));
    const end = point(shading.getAttribute("EndPoint"));
    if (axial) return { kind: "axial", start, end, stops: list };
    return {
      kind: "radial",
      start,
      end,
      startRadius: Math.max(0, numberAttr(shading, "StartRadius") ?? 0),
      endRadius: Math.max(0, numberAttr(shading, "EndRadius") ?? 0),
      stops: list,
    };
  }
  return { kind: "color", color: colorToCss(element, space) };
}
