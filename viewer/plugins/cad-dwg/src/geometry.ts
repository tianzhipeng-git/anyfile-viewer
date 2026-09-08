import { Matrix4, Vector3 } from "three";
import type { DwgDatabase, DwgEntity, DwgLineEntity, DwgCircleEntity, DwgArcEntity, DwgLWPolylineEntity,
  DwgPolyline2dEntity, DwgPolyline3dEntity, DwgInsertEntity, DwgDimensionEntity, DwgEllipseEntity,
  DwgSplineEntity, DwgAttdefEntity, DwgAttribEntity, DwgTextEntity, DwgMTextEntity, DwgSolidEntity, Dwg3dFaceEntity, DwgPointEntity,
  DwgHatchEntity, DwgMultiLeaderEntity, DwgLeaderEntity } from "@mlightcad/libredwg-web";
import { vector, ocs, insertTransform, normalVector } from "./coordinates";
import { arc, polyline, spline, sweep } from "./curves";
import { SceneBuilder, type Style } from "./scene-builder";
import { addHatch } from "./hatch";
import { addText } from "./text";
import { addMultiLeader, arrow } from "./leaders";
import { aciColor, readableColor } from "./colors";
import { MAX_ENTITIES } from "./types";

export function convertDrawing(database: DwgDatabase) {
  const blocks = new Map(database.tables.BLOCK_RECORD.entries.map(b => [b.name, b]));
  const model = blocks.get("*Model_Space");
  if (!model) throw new Error("Missing model space");
  const layers = new Map(database.tables.LAYER.entries.map(l => [l.name, l]));
  const visibility = Object.fromEntries([...layers].map(([name, l]) => [name, !l.off && !l.frozen]));
  const builder = new SceneBuilder();
  const nonModel = database.entities.filter(e => e.ownerBlockRecordSoftId !== model.handle);
  if (nonModel.length) builder.warnings["layout-objects"] = nonModel.length;
  function styleFor(e: DwgEntity, inherited: Style): Style {
    const layer = !e.layer || e.layer === "0" ? inherited.layer : e.layer;
    const entry = layers.get(layer);
    const byLayer = e.colorIndex == null || e.colorIndex === 256;
    const rgb = e.color ?? (byLayer ? entry?.color : undefined);
    const color = rgb != null ? rgb : e.colorIndex === 0 ? inherited.color : aciColor(byLayer ? entry?.colorIndex ?? 7 : e.colorIndex!);
    return { layer, color: readableColor(color) };
  }
  function walk(entities: DwgEntity[], matrix: Matrix4, path: string[], inherited: Style) {
    for (const entity of entities) {
      if (++builder.entities > MAX_ENTITIES) throw new RangeError("DWG entity budget");
      if (entity.isVisible === false) continue;
      const style = styleFor(entity, inherited);
      switch (entity.type) {
        case "INSERT": {
          const e = entity as DwgInsertEntity;
          const block = blocks.get(e.name);
          if (!block) { builder.warn("missing-block"); break; }
          if (path.length >= 16 || path.includes(e.name)) throw new RangeError("DWG cyclic/deep block");
          if (visibility[style.layer] === false) break;
          const rows = Math.max(1, e.rowCount || 1), columns = Math.max(1, e.columnCount || 1);
          if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows*columns > 10_000) throw new RangeError("DWG block array budget");
          const local = insertTransform(e.insertionPoint, block.basePoint, { x: e.xScale ?? 1, y: e.yScale ?? 1, z: e.zScale ?? 1 }, e.rotation ?? 0, e.extrusionDirection);
          // MINSERT spacings are measured in the rotated OCS, without the block scale.
          for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
            const offset = new Vector3(column*(e.columnSpacing ?? 0), row*(e.rowSpacing ?? 0), 0)
              .applyMatrix4(new Matrix4().makeRotationZ(e.rotation ?? 0)).applyMatrix4(ocs(e.extrusionDirection));
            const instance = matrix.clone().multiply(new Matrix4().makeTranslation(offset.x, offset.y, offset.z)).multiply(local);
            walk(block.entities.filter(item => item.type !== "ATTDEF" || ((item as DwgAttdefEntity).flags & 2) !== 0), instance, [...path, e.name], style);
          }
          // Attribute coordinates are already positioned in the containing space.
          walk(e.attribs ?? [], matrix, path, style);
          break;
        }
        case "DIMENSION": {
          const e = entity as DwgDimensionEntity, block = blocks.get(e.name);
          if (!block) { builder.warn("dimension-block"); break; }
          if (path.length >= 16 || path.includes(e.name)) throw new RangeError("DWG dimension recursion");
          walk(block.entities, matrix, [...path, e.name], style); break;
        }
        case "LINE": { const e = entity as DwgLineEntity; builder.add([vector(e.startPoint), vector(e.endPoint)], style, matrix); break; }
        case "CIRCLE": case "ARC": {
          const e = entity as DwgCircleEntity | DwgArcEntity;
          const start = e.type === "ARC" ? e.startAngle : 0, span = e.type === "ARC" ? sweep(start, e.endAngle) : 2*Math.PI;
          builder.add(arc(e.center, e.radius, start, span), style, matrix.clone().multiply(ocs(e.extrusionDirection))); break;
        }
        case "LWPOLYLINE": case "POLYLINE2D": case "POLYLINE3D": {
          const e = entity as DwgLWPolylineEntity | DwgPolyline2dEntity | DwgPolyline3dEntity;
          const transformed = e.type === "POLYLINE3D" ? matrix : matrix.clone().multiply(ocs(e.extrusionDirection));
          const elevation = e.type === "POLYLINE3D" ? undefined : e.elevation;
          builder.add(polyline(e.vertices, (e.flag & 1) !== 0, elevation), style, transformed);
          if ("constantWidth" in e && e.constantWidth || "startWidth" in e && e.startWidth || "endWidth" in e && e.endWidth) builder.warn("polyline-width");
          break;
        }
        case "ELLIPSE": {
          const e = entity as DwgEllipseEntity, major = vector(e.majorAxisEndPoint);
          const minor = normalVector(e.extrusionDirection).cross(major).multiplyScalar(e.axisRatio);
          const span = sweep(e.startAngle, e.endAngle);
          builder.add(Array.from({ length: 97 }, (_, i) => vector(e.center).addScaledVector(major, Math.cos(e.startAngle+span*i/96)).addScaledVector(minor, Math.sin(e.startAngle+span*i/96))), style, matrix); break;
        }
        case "SPLINE": {
          const points = spline(entity as DwgSplineEntity);
          if (points) builder.add(points, style, matrix); else builder.warn("spline-data"); break;
        }
        case "TEXT": addText(entity as DwgTextEntity, style, matrix, builder); break;
        case "ATTRIB": case "ATTDEF": {
          const e = entity as DwgAttribEntity | DwgAttdefEntity;
          if (e.flags & 1) break;
          addText({ ...e, ...e.text, text: e.type === "ATTDEF" && !path.length ? e.tag : e.text.text ?? "", type:"TEXT" } as DwgTextEntity, style, matrix, builder);
          if (e.mtextFlag) builder.warn("attribute-multiline");
          break;
        }
        case "MTEXT": addText(entity as DwgMTextEntity, style, matrix, builder); break;
        case "HATCH": addHatch(entity as DwgHatchEntity, style, matrix, builder); break;
        case "SOLID": case "TRACE": case "3DFACE": {
          const e = entity as DwgSolidEntity | Dwg3dFaceEntity;
          const fourth = e.corner4 ?? e.corner3;
          const points = entity.type === "3DFACE" ? [e.corner1, e.corner2, e.corner3, fourth] : [e.corner1, e.corner2, fourth, e.corner3];
          builder.add([points[0], points[1], points[2], points[0], points[2], points[3]].map(vector), style,
            entity.type === "3DFACE" ? matrix : matrix.clone().multiply(ocs((e as DwgSolidEntity).extrusionDirection)), "triangles"); break;
        }
        case "POINT": builder.add([vector((entity as DwgPointEntity).position)], style, matrix, "points"); break;
        case "MULTILEADER": addMultiLeader(entity as DwgMultiLeaderEntity, style, matrix, builder); break;
        case "LEADER": {
          const e = entity as DwgLeaderEntity, points = e.vertices.map(vector);
          builder.add(points, style, matrix);
          if (e.isArrowheadEnabled) arrow(points, e.textHeight ?? 1, normalVector(e.normal), style, matrix, builder);
          if (e.isSpline) builder.warn("leader-spline"); break;
        }
        default: builder.warn(entity.type);
      }
    }
  }
  walk(model.entities, new Matrix4(), [], { layer: "0", color: 0x718096 });
  return builder.finish(visibility, database.header.INSUNITS);
}
