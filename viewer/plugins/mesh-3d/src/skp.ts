import { unzipSync } from "fflate";
import { buildInstancedScene, toInstancedGLB, type InstancedScene } from "openskp";
import { isSkp } from "./skp-header";

const MIB = 1024 * 1024;

// Inspect the same embedded ZIP that OpenSKP reads, without inflating entries.
export function validateSkpInput(bytes: Uint8Array) {
  if (bytes.byteLength > 128 * MIB) throw new RangeError("SKP input budget");
  if (!isSkp(bytes)) throw new Error("Invalid SKP header");
  let zipOffset = -1;
  for (let i = 0; i + 4 <= Math.min(256, bytes.length); i++) {
    if (bytes[i] === 80 && bytes[i + 1] === 75 && bytes[i + 2] === 3 && bytes[i + 3] === 4) { zipOffset = i; break; }
  }
  if (zipOffset < 0) {
    if (!new TextDecoder().decode(bytes.subarray(0, 512)).includes("CVersionMap")) throw new Error("Unsupported SKP container");
    return;
  }
  let expanded = 0, entries = 0;
  unzipSync(bytes.subarray(zipOffset), { filter(entry) {
    expanded += entry.originalSize;
    if (++entries > 4096 || entry.originalSize > 64 * MIB || expanded > 128 * MIB) throw new RangeError("SKP expanded package budget");
    return false;
  } });
}

export function validateSkpScene(scene: InstancedScene) {
  let vertices = 0, bytes = 0, primitives = 0;
  if (scene.gltfMaterials.length > 4096 || scene.textures.length > 256) throw new RangeError("SKP material budget");
  const drawsByResource = new Map<string, number>();
  for (const resource of scene.meshResources) {
    drawsByResource.set(resource.id, resource.primitives.length);
    for (const primitive of resource.primitives) {
      vertices += primitive.positions.length / 3;
      bytes += primitive.positions.byteLength + primitive.normals.byteLength + primitive.uvs.byteLength + primitive.indices.byteLength;
      if (++primitives > 4096 || vertices > 6_000_000 || bytes > 128 * MIB) throw new RangeError("SKP geometry budget");
    }
  }
  if (!vertices) throw new Error("Empty SKP scene");
  for (const texture of scene.textures) {
    bytes += texture.data.byteLength;
    if (texture.data.byteLength > 16 * MIB || bytes > 128 * MIB) throw new RangeError("SKP texture budget");
  }
  let nodes = 0, draws = 0;
  const pending = [{ node: scene.sceneHierarchy, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    draws += node.meshResourceId ? drawsByResource.get(node.meshResourceId) ?? 0 : 0;
    if (++nodes > 4096 || draws > 4096 || depth > 64) throw new RangeError("SKP scene graph budget");
    for (const child of node.children) pending.push({ node: child, depth: depth + 1 });
  }
}

export function parseSkpForViewer(buffer: ArrayBuffer): ArrayBuffer {
  validateSkpInput(new Uint8Array(buffer));
  const scene = buildInstancedScene(buffer, {
    respectEdgeVisibility: true,
    onProgress({ stage, current, total }) {
      const limit = stage === "build_scene" || stage === "legacy_defs" ? 4096 : 2_000_000;
      if (Math.max(current, total) > limit) throw new RangeError("SKP parser budget");
    },
  });
  validateSkpScene(scene);
  const glb = toInstancedGLB(scene, { textures: true });
  if (glb.byteLength > 256 * MIB) throw new RangeError("SKP render buffer budget");
  return glb.slice().buffer as ArrayBuffer;
}
