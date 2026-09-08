import { BufferAttribute, BufferGeometry, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Points, PointsMaterial } from "three";
import { disposeObject } from "@anyfile/rendering-3d";
import type { DrawingData } from "./types";
import { appendText } from "./text-mesh";
export function drawingDocument(data: DrawingData, description: string) {
  const root = new Group(), layers = new Map<string, Group>();
  const layer = (name: string) => {
    if (!layers.has(name)) { const group = new Group(); group.name = name; group.visible = data.layers[name] !== false; root.add(group); layers.set(name,group); }
    return layers.get(name)!;
  };
  try {
    for (const batch of data.batches) {
      const geometry = new BufferGeometry(); geometry.setAttribute("position",new BufferAttribute(batch.positions,3));
      const object = batch.kind === "triangles" ? new Mesh(geometry,new MeshBasicMaterial({ color:batch.color, side:DoubleSide, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 }))
        : batch.kind === "points" ? new Points(geometry,new PointsMaterial({ color:batch.color, size:3, sizeAttenuation:false }))
        : new LineSegments(geometry,new LineBasicMaterial({ color:batch.color }));
      layer(batch.layer).add(object);
    }
    for (const text of data.texts) layer(text.layer);
    appendText(data.texts,layers);
    root.userData.origin = data.origin;
    const units: Record<number,string> = {1:"in",2:"ft",4:"mm",5:"cm",6:"m",7:"km",10:"yd",14:"dm"};
    return { root, up:"z" as const, planar:true, units:data.units ? units[data.units] : undefined, description };
  } catch (error) { disposeObject(root); throw error; }
}
