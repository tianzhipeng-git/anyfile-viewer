import { BufferAttribute, BufferGeometry, DoubleSide, Group, Matrix4, Mesh, MeshStandardMaterial } from "three";
import { type Rendering3dDocument } from "@anyfile/rendering-3d";
import type { IfcData } from "./types";

export function ifcDocument(data: IfcData): Rendering3dDocument {
  const root = new Group();
  const geometries = new Map<number, BufferGeometry>();
  const materials = new Map<string, MeshStandardMaterial>();
  try {
    for (const item of data.geometries) {
      const geometry = new BufferGeometry(); geometries.set(item.id, geometry);
      const positions = new Float32Array(item.vertices.length / 2);
      const normals = new Float32Array(positions.length);
      for (let source = 0, target = 0; source < item.vertices.length; source += 6, target += 3) {
        positions.set(item.vertices.subarray(source, source + 3), target);
        normals.set(item.vertices.subarray(source + 3, source + 6), target);
      }
      geometry.setAttribute("position", new BufferAttribute(positions, 3));
      geometry.setAttribute("normal", new BufferAttribute(normals, 3));
      geometry.setIndex(new BufferAttribute(item.indices, 1));
    }
    const types = new Map<string, Group>();
    for (const item of data.elements) {
      const element = new Group(); element.name = `${item.name} (#${item.id})`;
      if (data.elements.length <= 256) root.add(element);
      else {
        let group = types.get(item.type);
        if (!group) { group = new Group(); group.name = item.type; types.set(item.type, group); root.add(group); }
        group.add(element);
      }
      for (const part of item.parts) {
        const key = part.color.join(",");
        let material = materials.get(key);
        if (!material) {
          material = new MeshStandardMaterial({ side: DoubleSide, roughness: 0.8, opacity: part.color[3], transparent: part.color[3] < 1, depthWrite: part.color[3] >= 1 });
          material.color.setRGB(part.color[0], part.color[1], part.color[2]); materials.set(key, material);
        }
        const mesh = new Mesh(geometries.get(part.geometry), material);
        mesh.applyMatrix4(new Matrix4().fromArray(part.transform)); element.add(mesh);
      }
    }
    // web-ifc's default geometry transform is Y-up, with linear scaling to meters.
    return { root, up: "y", units: "m", description: data.schema };
  } catch (error) {
    root.clear();
    for (const geometry of geometries.values()) geometry.dispose();
    for (const material of materials.values()) material.dispose();
    throw error;
  }
}
