import { Matrix4, ShapeUtils, Vector2, Vector3 } from "three";
import type { DwgArcEdge, DwgHatchEntity, DwgLineEdge, DwgPolylineBoundaryPath, DwgEdgeBoundaryPath, DwgBoundaryPathEdge } from "@mlightcad/libredwg-web";
import { arc, polyline, sweep } from "./curves";
import { SceneBuilder, type Style } from "./scene-builder";
import { ocs } from "./coordinates";

function inside(point: Vector2, ring: Vector2[]) {
  let result = false;
  for (let i = 0, j = ring.length-1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) result = !result;
  }
  return result;
}
export function hatchRings(e: DwgHatchEntity) {
  if (e.boundaryPaths.length > 256) throw new RangeError("Hatch loop budget");
  const rings: Vector2[][] = [];
  let total = 0;
  for (const path of e.boundaryPaths) {
    let points: Vector3[];
    if (path.boundaryPathTypeFlag & 2) points = polyline((path as DwgPolylineBoundaryPath).vertices, true);
    else {
      points = [];
      const edges = (path as DwgEdgeBoundaryPath<DwgBoundaryPathEdge>).edges;
      if (edges.length > 10_000) throw new RangeError("Hatch edge budget");
      for (const edge of edges) {
        if (edge.type === 1) { const line = edge as DwgLineEdge; points.push(new Vector3(line.start.x, line.start.y), new Vector3(line.end.x, line.end.y)); }
        else if (edge.type === 2) { const circle = edge as DwgArcEdge; points.push(...arc(circle.center, circle.radius, circle.startAngle, sweep(circle.startAngle, circle.endAngle, circle.isCCW !== false))); }
        else return undefined;
      }
    }
    const ring = points.map(p => new Vector2(p.x, p.y)).filter((p, i, list) => !i || p.distanceToSquared(list[i-1]) > 1e-18);
    if (ring.length > 1 && ring[0].distanceToSquared(ring.at(-1)!) < 1e-18) ring.pop();
    if ((total += ring.length) > 20_000) throw new RangeError("Hatch sampling budget");
    if (ring.length >= 3) rings.push(ring);
  }
  return rings;
}
export function triangulateRings(rings: Vector2[][]) {
  const depths = rings.map((r, i) => rings.filter((other, j) => i !== j && inside(r[0], other)).length);
  const triangles: Vector3[] = [];
  rings.forEach((outer, i) => {
    if (depths[i]%2) return;
    const holes = rings.filter((r, j) => depths[j] === depths[i]+1 && inside(r[0], outer));
    const points = [outer, ...holes].flat();
    for (const triangle of ShapeUtils.triangulateShape(outer, holes)) for (const index of triangle) triangles.push(new Vector3(points[index].x, points[index].y));
  });
  return triangles;
}
export function addHatch(e: DwgHatchEntity, style: Style, parent: Matrix4, builder: SceneBuilder) {
  const rings = hatchRings(e);
  if (!rings?.length) { builder.warn("hatch-boundary"); return; }
  const matrix = parent.clone().multiply(ocs(e.extrusionDirection));
  if (e.offsetVector) matrix.multiply(new Matrix4().makeTranslation(e.offsetVector.x, e.offsetVector.y, e.offsetVector.z ?? 0));
  if (e.solidFill || e.gradientFlag) {
    // Non-parity hatch styles need separate region semantics, do not fill their holes incorrectly.
    if (e.hatchStyle) { builder.warn("hatch-style"); for (const ring of rings) builder.add([...ring, ring[0]].map(p => new Vector3(p.x, p.y)), style, matrix); return; }
    builder.add(triangulateRings(rings), style, matrix, "triangles");
    if (e.gradientFlag) builder.warn("gradient-fill");
    return;
  }
  if (e.hatchStyle || !e.definitionLines.length) { builder.warn("hatch-pattern"); return; }
  if (e.definitionLines.length > 64) throw new RangeError("Hatch pattern budget");
  let steps = 0, intersections = 0;
  // DXF definition lines already contain the applied pattern scale/rotation.
  for (const definition of e.definitionLines) {
    const d = new Vector2(Math.cos(definition.angle), Math.sin(definition.angle));
    const n = new Vector2(-d.y, d.x), base = new Vector2(definition.base.x, definition.base.y);
    const offset = new Vector2(definition.offset.x, definition.offset.y), spacing = n.dot(offset);
    if (!Number.isFinite(spacing) || Math.abs(spacing) < 1e-10) { builder.warn("hatch-spacing"); continue; }
    let min = Infinity, max = -Infinity;
    for (const ring of rings) for (const p of ring) { const k = n.dot(p.clone().sub(base))/spacing; min = Math.min(min, k); max = Math.max(max, k); }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max-min > 20_000) throw new RangeError("Hatch density budget");
    for (let k = Math.ceil(min); k <= Math.floor(max); k++) {
      if (++steps > 20_000) throw new RangeError("Hatch line budget");
      const origin = base.clone().addScaledVector(offset, k), hits: number[] = [];
      for (const ring of rings) for (let i = 0; i < ring.length; i++) {
        if (++intersections > 2_000_000) throw new RangeError("Hatch intersection budget");
        const a = ring[i].clone().sub(origin), b = ring[(i+1)%ring.length].clone().sub(origin);
        const ay = a.dot(n), by = b.dot(n);
        if ((ay > 0) !== (by > 0)) hits.push(a.dot(d)+(b.dot(d)-a.dot(d))*(-ay)/(by-ay));
      }
      hits.sort((a, b) => a-b);
      for (let i = 0; i+1 < hits.length; i += 2) {
        builder.add([hits[i], hits[i+1]].map(t => new Vector3(origin.x+t*d.x, origin.y+t*d.y)), style, matrix);
      }
    }
    if (definition.dashLengths.length) builder.warn("hatch-dashes");
  }
}
