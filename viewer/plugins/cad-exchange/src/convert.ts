import type { CadData, KernelResult } from "./types";
export function convertCad(result: KernelResult, heapBytes = 0): CadData {
  if (!result.success) { if (result.error === "resource-limit") throw new RangeError(); throw new Error("CAD import failed"); }
  const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  let vertices = 0, triangles = 0;
  for (const mesh of result.meshes) {
    const positions = mesh.attributes.position.array;
    if (positions.length % 3 || mesh.index.array.length % 3 || mesh.index.array.some(index => !Number.isInteger(index) || index < 0 || index >= positions.length / 3)) throw new Error("Invalid CAD geometry layout");
    vertices += positions.length / 3; triangles += mesh.index.array.length / 3;
    if (vertices > 1_000_000 || triangles > 500_000) throw new RangeError();
    for (let index = 0; index < positions.length; index++) {
      const value = positions[index]; if (!Number.isFinite(value)) throw new Error("Non-finite CAD vertex");
      min[index % 3] = Math.min(min[index % 3],value); max[index % 3] = Math.max(max[index % 3],value);
    }
  }
  if (!vertices) throw new Error("Empty CAD shape");
  const origin = min.map((value, axis) => value / 2 + max[axis] / 2);
  const meshes = result.meshes.map(mesh => {
    const positions = Float32Array.from(mesh.attributes.position.array,(value,index) => value - origin[index % 3]);
    const indices = Uint32Array.from(mesh.index.array);
    const normals = mesh.attributes.normal ? Float32Array.from(mesh.attributes.normal.array) : undefined;
    const colors = new Float32Array(positions.length);
    const base = mesh.color ?? [0.6,0.72,0.8];
    for (let index = 0; index < positions.length; index += 3) colors.set(base,index);
    const edges: number[] = [];
    for (const face of mesh.brep_faces) {
      if (face.first < 0 || face.last >= indices.length / 3) throw new Error("Invalid CAD face range");
      const edgeMap = new Map<number, { a: number; b: number; count: number }>();
      for (let triangle = face.first; triangle <= face.last; triangle++) {
        const polygon = [indices[triangle * 3],indices[triangle * 3 + 1],indices[triangle * 3 + 2]];
        for (let corner = 0; corner < 3; corner++) {
          const a = polygon[corner], b = polygon[(corner + 1) % 3];
          if (a >= positions.length / 3 || b >= positions.length / 3) throw new Error("Invalid CAD index");
          if (face.color) colors.set(face.color,a * 3);
          const key = Math.min(a,b) * (positions.length / 3) + Math.max(a,b);
          const previous = edgeMap.get(key);
          if (previous) previous.count++; else edgeMap.set(key,{ a,b,count:1 });
        }
      }
      for (const edge of edgeMap.values()) if (edge.count === 1) for (const vertex of [edge.a,edge.b]) edges.push(positions[vertex * 3],positions[vertex * 3 + 1],positions[vertex * 3 + 2]);
    }
    return { name: mesh.name, positions, indices, normals, colors, edges: new Float32Array(edges) };
  });
  return { root: result.root, meshes, origin, heapBytes };
}
