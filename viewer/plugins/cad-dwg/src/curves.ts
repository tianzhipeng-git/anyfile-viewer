import { Vector3, Vector4 } from "three";
import { NURBSCurve } from "three/addons/curves/NURBSCurve.js";
import type { DwgSplineEntity } from "@mlightcad/libredwg-web";
import { vector } from "./coordinates";
import type { Point } from "./types";
export function arc(center: Point, radius: number, start: number, sweep: number) {
  if (![radius, start, sweep].every(Number.isFinite) || radius < 0) throw new Error("Invalid arc");
  const count = Math.max(2, Math.ceil(Math.abs(sweep)/(Math.PI/48)));
  if (count > 256) throw new RangeError("Curve budget");
  return Array.from({ length: count+1 }, (_, i) => new Vector3(center.x+radius*Math.cos(start+sweep*i/count), center.y+radius*Math.sin(start+sweep*i/count), center.z ?? 0));
}
export function sweep(start: number, end: number, ccw = true) {
  const span = ((end-start) % (2*Math.PI)+2*Math.PI) % (2*Math.PI);
  return ccw ? span || 2*Math.PI : span === 0 ? -2*Math.PI : span-2*Math.PI;
}
export function polyline(vertices: (Point & { bulge?: number })[], closed: boolean, elevation?: number) {
  if (vertices.length > 100_000) throw new RangeError("Polyline budget");
  const result: Vector3[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const a = { ...vertices[i], z: elevation ?? vertices[i].z ?? 0 };
    const b = vertices[(i+1)%vertices.length];
    const bulge = a.bulge ?? 0;
    if (!bulge || (!closed && i === vertices.length-1)) result.push(vector(a));
    else {
      const offset = (1-bulge*bulge)/(4*bulge);
      const center = { x: (a.x+b.x)/2-(b.y-a.y)*offset, y: (a.y+b.y)/2+(b.x-a.x)*offset, z: a.z };
      result.push(...arc(center, Math.hypot(a.x-center.x, a.y-center.y), Math.atan2(a.y-center.y, a.x-center.x), 4*Math.atan(bulge)).slice(0, -1));
    }
    if (result.length > 200_000) throw new RangeError("Polyline sampling budget");
  }
  if (closed && result.length) result.push(result[0].clone());
  return result;
}
export function spline(e: DwgSplineEntity) {
  const { degree, knots, controlPoints, weights } = e;
  if (degree < 1 || degree > 10 || !Number.isInteger(degree) || controlPoints.length < degree+1 || controlPoints.length > 10_000 || knots.length !== controlPoints.length+degree+1) return undefined;
  if (!knots.every((v, i) => Number.isFinite(v) && (!i || v >= knots[i-1]))) return undefined;
  const points = controlPoints.map((p, i) => new Vector4(p.x, p.y, p.z ?? 0, weights?.[i] ?? 1));
  return new NURBSCurve(degree, knots, points, degree, knots.length-degree-1).getPoints(Math.min(1024, Math.max(48, controlPoints.length*8)));
}
