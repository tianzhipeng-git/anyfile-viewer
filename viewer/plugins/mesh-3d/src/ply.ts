import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { DoubleSide, Group, Mesh, MeshStandardMaterial, Points, PointsMaterial } from "three";
export function loadPly(bytes: ArrayBuffer) {
  const header = new TextDecoder().decode(bytes.slice(0, 64 * 1024));
  const end = header.indexOf("end_header"); if (end < 0) throw new Error("Missing PLY header");
  let vertices = 0, faces = 0;
  for (const match of header.slice(0, end).matchAll(/element\s+(\w+)\s+(\d+)/g)) {
    const count = Number(match[2]); if (count > 2_000_000) throw new RangeError();
    if (match[1] === "vertex") vertices = count; else if (match[1] === "face") faces = count;
  }
  if (!vertices) throw new Error("Empty PLY");
  const geometry = new PLYLoader().parse(bytes);
  const root = new Group();
  if (faces) { geometry.computeVertexNormals(); root.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x9bb1bd, vertexColors: geometry.hasAttribute("color"), side: DoubleSide }))); }
  else root.add(new Points(geometry, new PointsMaterial({ color: 0x7b9eb5, vertexColors: geometry.hasAttribute("color"), size: 2, sizeAttenuation: false })));
  return { root };
}
