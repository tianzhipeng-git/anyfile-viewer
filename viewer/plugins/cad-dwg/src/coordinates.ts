import { Matrix4, Vector3 } from "three";
import type { Point } from "./types";
export const vector = (p: Point) => new Vector3(p.x, p.y, p.z ?? 0);
export function normalVector(p?: Point) {
  const normal = p ? vector(p) : new Vector3(0, 0, 1);
  // The upstream converter emits zero for an omitted/default extrusion vector.
  if (normal.lengthSq() === 0) normal.set(0, 0, 1);
  return normal.normalize();
}
// Autodesk's arbitrary axis algorithm; applies only to entities stored in OCS.
export function ocs(p?: Point): Matrix4 {
  const normal = normalVector(p);
  const axis = Math.abs(normal.x) < 1/64 && Math.abs(normal.y) < 1/64 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  const x = axis.cross(normal).normalize();
  return new Matrix4().makeBasis(x, normal.clone().cross(x).normalize(), normal);
}
export function insertTransform(position: Point, base: Point, scale: Point, rotation: number, normal?: Point) {
  return ocs(normal).multiply(new Matrix4().makeTranslation(position.x, position.y, position.z ?? 0))
    .multiply(new Matrix4().makeRotationZ(rotation)).multiply(new Matrix4().makeScale(scale.x, scale.y, scale.z ?? 1))
    .multiply(new Matrix4().makeTranslation(-base.x, -base.y, -(base.z ?? 0)));
}
