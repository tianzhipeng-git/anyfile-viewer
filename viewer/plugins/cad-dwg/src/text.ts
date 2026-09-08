import { Matrix4, Vector3 } from "three";
import type { DwgMTextEntity, DwgTextEntity } from "@mlightcad/libredwg-web";
import { normalVector, ocs, vector } from "./coordinates";
import { SceneBuilder, type Style } from "./scene-builder";

export function plainCadText(value: string) {
  if (value.length > 16_384) throw new RangeError("DWG text length budget");
  return value.replace(/\\U\+([0-9a-f]{4})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/%%d/gi, "°").replace(/%%p/gi, "±").replace(/%%c/gi, "Ø")
    .replace(/\\P/g, "\n").replace(/\\~/g, " ").replace(/\\S([^;]*);/g, (_, fraction: string) => fraction.replace(/[\^#]/g, "/"))
    .replace(/\\[ACcFfHhQqTtWwpa][^;]*;/g, "").replace(/\\[LlOoKk]/g, "")
    .replace(/(?<!\\)[{}]/g, "").replace(/\\([\\{}])/g, "$1");
}
export function addText(e: DwgTextEntity | DwgMTextEntity, style: Style, parent: Matrix4, builder: SceneBuilder) {
  const text = plainCadText(e.text);
  if (!text.trim()) return;
  if (!Number.isFinite(e.textHeight) || e.textHeight <= 0) { builder.warn("text-height"); return; }
  let position: Vector3, x: Vector3, y: Vector3, matrix: Matrix4, alignX = 0, alignY = 0, width: number | undefined;
  if (e.type === "MTEXT") {
    position = vector(e.insertionPoint);
    const normal = normalVector(e.extrusionDirection);
    x = e.direction ? vector(e.direction) : new Vector3(Math.cos(e.rotation), Math.sin(e.rotation), 0);
    if (x.lengthSq() === 0) x.set(1, 0, 0);
    x.normalize(); y = normal.cross(x).normalize();
    x.multiplyScalar(e.textHeight); y.multiplyScalar(e.textHeight);
    matrix = parent;
    const attachment = Math.max(1, Math.min(9, e.attachmentPoint || 1))-1;
    alignX = attachment%3/2; alignY = 1-Math.floor(attachment/3)/2;
    width = e.rectWidth > 0 ? e.rectWidth/e.textHeight : undefined;
  } else {
    position = vector((e.halign || e.valign) && e.endPoint ? e.endPoint : e.startPoint);
    const rotation = e.rotation ?? 0, scale = e.xScale || 1;
    const flipX = e.generationFlag & 2 ? -1 : 1, flipY = e.generationFlag & 4 ? -1 : 1;
    x = new Vector3(Math.cos(rotation), Math.sin(rotation), 0).multiplyScalar(e.textHeight*scale*flipX);
    y = new Vector3(-Math.sin(rotation), Math.cos(rotation), 0).multiplyScalar(e.textHeight*flipY);
    matrix = parent.clone().multiply(ocs(e.extrusionDirection));
    alignX = e.halign === 1 || e.halign === 4 ? 0.5 : e.halign === 2 ? 1 : 0;
    alignY = e.valign === 2 ? 0.5 : e.valign === 3 ? 1 : 0;
    if (e.halign === 3 || e.halign === 5 || e.obliqueAngle) builder.warn("text-alignment");
  }
  builder.text({ text, ...style, alignX, alignY, width }, position, x, y, matrix);
}
