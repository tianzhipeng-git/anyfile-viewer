import { Matrix4, Vector3 } from "three";
import type { DwgMTextEntity, DwgMultiLeaderEntity } from "@mlightcad/libredwg-web";
import { vector, normalVector } from "./coordinates";
import { addText } from "./text";
import { SceneBuilder, type Style } from "./scene-builder";
export function arrow(points: Vector3[], size: number, normal: Vector3, style: Style, matrix: Matrix4, builder: SceneBuilder) {
  if (points.length < 2 || size <= 0) return;
  const direction = points[1].clone().sub(points[0]).normalize();
  const side = normal.clone().cross(direction).normalize().multiplyScalar(size/5);
  const base = points[0].clone().addScaledVector(direction, size);
  builder.add([points[0], base.clone().add(side), base.clone().sub(side)], style, matrix, "triangles");
}
export function addMultiLeader(e: DwgMultiLeaderEntity, style: Style, matrix: Matrix4, builder: SceneBuilder) {
  if (!e.leaderSections?.length) builder.warn("multileader-path");
  for (const section of e.leaderSections ?? []) {
    for (const line of section.leaderLines) {
      const points = line.vertices.map(vector);
      if (section.lastLeaderLinePoint) points.push(vector(section.lastLeaderLinePoint));
      builder.add(points, style, matrix);
      arrow(points, e.arrowheadSize ?? 0, normalVector(e.normal), style, matrix, builder);
      if (line.breaks?.length) builder.warn("leader-breaks");
    }
    if (e.doglegEnabled && section.lastLeaderLinePoint && section.doglegVector) {
      const start = vector(section.lastLeaderLinePoint);
      builder.add([start, start.clone().addScaledVector(vector(section.doglegVector), section.doglegLength ?? e.doglegLength ?? 0)], style, matrix);
    }
  }
  if (e.hasMText && e.textContent && e.textAnchor && e.textHeight) {
    addText({ type: "MTEXT", text: e.textContent, insertionPoint: e.textAnchor, textHeight: e.textHeight,
      direction: e.textDirection, extrusionDirection: e.normal, rotation: e.textRotation ?? 0,
      attachmentPoint: e.textAttachmentPoint || 1, rectWidth: e.textWidth ?? 0 } as DwgMTextEntity, style, matrix, builder);
  } else if (e.hasBlock) builder.warn("multileader-block");
}
