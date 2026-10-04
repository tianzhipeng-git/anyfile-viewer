import { unzipSync } from "fflate";
import { buildInstancedScene, toInstancedGLB, type InstancedScene } from "openskp";
import { isSkp } from "./skp-header";
import { checkSkpLimit } from "./skp-limits";

const MIB = 1024 * 1024;

// Inspect the same embedded ZIP that OpenSKP reads, without inflating entries.
export function validateSkpInput(bytes: Uint8Array) {
  checkSkpLimit("input", bytes.byteLength / MIB, 128, "MiB");
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
    checkSkpLimit("entries", ++entries, 4096);
    checkSkpLimit("entry", entry.originalSize / MIB, 512, "MiB");
    checkSkpLimit("expanded", expanded / MIB, 768, "MiB");
    return false;
  } });
}

export function validateSkpScene(scene: InstancedScene) {
  let vertices = 0, bytes = 0, primitives = 0;
  checkSkpLimit("materials", scene.gltfMaterials.length, 4096);
  checkSkpLimit("textures", scene.textures.length, 256);
  const drawsByResource = new Map<string, number>();
  for (const resource of scene.meshResources) {
    drawsByResource.set(resource.id, resource.primitives.length);
    for (const primitive of resource.primitives) {
      vertices += primitive.positions.length / 3;
      bytes += primitive.positions.byteLength + primitive.normals.byteLength + primitive.uvs.byteLength + primitive.indices.byteLength;
      checkSkpLimit("primitives", ++primitives, 4096);
      checkSkpLimit("vertices", vertices, 6_000_000);
      checkSkpLimit("geometry", bytes / MIB, 128, "MiB");
    }
  }
  if (!vertices) throw new Error("Empty SKP scene");
  for (const texture of scene.textures) {
    bytes += texture.data.byteLength;
    checkSkpLimit("texture", texture.data.byteLength / MIB, 16, "MiB");
    checkSkpLimit("geometry", bytes / MIB, 128, "MiB");
  }
  let nodes = 0, draws = 0;
  const pending = [{ node: scene.sceneHierarchy, depth: 0 }];
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    draws += node.meshResourceId ? drawsByResource.get(node.meshResourceId) ?? 0 : 0;
    checkSkpLimit("nodes", ++nodes, 4096);
    checkSkpLimit("draws", draws, 4096);
    checkSkpLimit("depth", depth, 64);
    for (const child of node.children) pending.push({ node: child, depth: depth + 1 });
  }
}

export function parseSkpForViewer(buffer: ArrayBuffer): ArrayBuffer {
  validateSkpInput(new Uint8Array(buffer));
  const scene = buildInstancedScene(buffer, {
    respectEdgeVisibility: true,
    onProgress({ stage, current, total }) {
      const limit = stage === "build_scene" || stage === "legacy_defs" ? 4096 : 2_000_000;
      checkSkpLimit("records", Math.max(current, total), limit);
    },
  });
  validateSkpScene(scene);
  const glb = toInstancedGLB(scene, { textures: true });
  checkSkpLimit("output", glb.byteLength / MIB, 256, "MiB");
  return glb.buffer as ArrayBuffer;
}
