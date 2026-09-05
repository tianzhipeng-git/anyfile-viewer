import { BufferAttribute, BufferGeometry, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial } from "three";
import { disposeObject } from "@anyfile/rendering-3d";
import type { CadData, CadNode } from "./types";
export function cadExchangeDocument(data: CadData, brep: boolean) {
  const root = new Group();
  try {
    const meshes = data.meshes.map(mesh => {
      const group = new Group(); group.name = mesh.name;
      const geometry = new BufferGeometry(); geometry.setAttribute("position",new BufferAttribute(mesh.positions,3)); geometry.setAttribute("color",new BufferAttribute(mesh.colors,3)); geometry.setIndex(new BufferAttribute(mesh.indices,1));
      if (mesh.normals) geometry.setAttribute("normal",new BufferAttribute(mesh.normals,3)); else geometry.computeVertexNormals();
      group.add(new Mesh(geometry,new MeshStandardMaterial({ vertexColors:true, side:DoubleSide, roughness:0.8, polygonOffset:true, polygonOffsetFactor:1, polygonOffsetUnits:1 })));
      if (mesh.edges.length) { const edges = new BufferGeometry(); edges.setAttribute("position",new BufferAttribute(mesh.edges,3)); group.add(new LineSegments(edges,new LineBasicMaterial({ color:0x505762 }))); }
      // Own every template until nodes have been attached, including failures.
      root.add(group); return group;
    });
    const assembly = new Group();
    const append = (node: CadNode, parent: Group, depth: number) => {
      if (depth > 64) throw new RangeError();
      const group = new Group(); group.name = node.name; parent.add(group);
      for (const index of node.meshes) { if (!meshes[index]) throw new Error("Invalid assembly mesh"); group.add(meshes[index].clone(true)); }
      for (const child of node.children) append(child,group,depth + 1);
    };
    append(data.root,assembly,0);
    let visibleRoot = assembly;
    while (visibleRoot.children.length === 1 && visibleRoot.children[0] instanceof Group && visibleRoot.children[0].children.every(child => child instanceof Group)) visibleRoot = visibleRoot.children[0] as Group;
    root.clear(); root.add(...visibleRoot.children); root.userData.origin = data.origin; root.userData.kernelHeapBytes = data.heapBytes;
    return { root, up: "z" as const, units: brep ? undefined : "mm" };
  } catch (error) { disposeObject(root); throw error; }
}
