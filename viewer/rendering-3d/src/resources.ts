import { Box3, BufferGeometry, Material, Mesh, Object3D, Texture, Vector3 } from "three";

export function disposeObject(root: Object3D) {
  const resources = new Set<BufferGeometry | Material | Texture>();
  root.traverse((object) => {
    const renderable = object as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (renderable.geometry) resources.add(renderable.geometry);
    for (const material of [renderable.material].flat()) {
      if (!material) continue;
      resources.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) resources.add(value);
    }
  });
  for (const resource of resources) {
    if (resource instanceof Texture && typeof ImageBitmap !== "undefined" && resource.image instanceof ImageBitmap) resource.image.close();
    resource.dispose();
  }
  root.clear();
}

export function inspectObject(root: Object3D) {
  let vertices = 0;
  let bytes = 0;
  let draws = 0; let triangles = 0;
  const geometries = new Set<BufferGeometry>();
  root.traverse((object) => {
    const geometry = (object as Object3D & { geometry?: BufferGeometry }).geometry;
    if (!geometry) return;
    draws += Math.max(1, geometry.groups.length);
    if (object instanceof Mesh) triangles += (geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0) / 3;
    if (geometries.has(geometry)) return;
    geometries.add(geometry);
    const position = geometry.getAttribute("position");
    if (!position || !position.count) throw new Error("Empty geometry");
    vertices += position.count;
    for (let i = 0; i < position.count; i++) {
      if (![position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)) throw new Error("Non-finite vertex");
    }
    const index = geometry.getIndex();
    if (index) for (let i = 0; i < index.count; i++) {
      const value = index.getX(i);
      if (value < 0 || value >= position.count) throw new Error("Invalid index");
    }
    for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength;
    bytes += index?.array.byteLength ?? 0;
  });
  if (!vertices) throw new Error("Empty scene");
  if (vertices > 6_000_000 || bytes > 256 * 1024 * 1024 || draws > 4096) throw new RangeError("Scene budget exceeded");
  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  if (![...bounds.min, ...bounds.max, ...size].every(Number.isFinite)) throw new Error("Invalid bounds");
  return { vertices, triangles, bytes, draws, bounds, size };
}
