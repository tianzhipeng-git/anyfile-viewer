import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, MeshStandardMaterial } from "three";
export function mesh(positions: number[], indices: number[], color = "#87a9bc") {
  if (positions.length > 6_000_000 || indices.length > 6_000_000) throw new RangeError();
  if (!positions.length || !indices.length || positions.length % 3 || indices.length % 3 || !positions.every(Number.isFinite)) throw new Error("Invalid mesh");
  if (indices.some(i => !Number.isInteger(i) || i < 0 || i >= positions.length / 3)) throw new Error("Invalid index");
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return new Mesh(geometry, new MeshStandardMaterial({ color, side: DoubleSide, roughness: 0.8 }));
}
