import { BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from "three";
export function loadOff(source: string) {
  const tokens = source.replace(/#[^\n]*/g, "").trim().split(/\s+/); let cursor = 0;
  if (tokens[cursor++] !== "OFF") throw new Error("Invalid OFF");
  const read = () => { const value = Number(tokens[cursor++]); if (!Number.isFinite(value)) throw new Error("Invalid number"); return value; };
  const vertices = read(), faces = read(); read();
  if (![vertices, faces].every(n => Number.isInteger(n) && n > 0)) throw new Error("Invalid count");
  if (vertices > 2_000_000 || faces > 1_000_000) throw new RangeError();
  const positions = Array.from({ length: vertices * 3 }, read); const indices: number[] = [];
  for (let face = 0; face < faces; face++) {
    const count = read(); if (!Number.isInteger(count) || count < 3 || count > 10000) throw new Error("Invalid polygon");
    const polygon = Array.from({ length: count }, read);
    if (polygon.some(i => !Number.isInteger(i) || i < 0 || i >= vertices)) throw new Error("Invalid index");
    for (let i = 1; i + 1 < count; i++) indices.push(polygon[0], polygon[i], polygon[i + 1]);
    if (indices.length > 6_000_000) throw new RangeError();
  }
  if (cursor !== tokens.length) throw new Error("Unsupported OFF attributes");
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const root = new Group(); root.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x7b9eb5, side: DoubleSide })));
  return { root };
}
