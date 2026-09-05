import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial } from "three";
import type { Rendering3dDocument } from "@anyfile/rendering-3d";
import type { parseStl } from "./stl";
export async function loadStl(bytes: ArrayBuffer, signal: AbortSignal): Promise<Rendering3dDocument> {
  const result = await new Promise<ReturnType<typeof parseStl>>((resolve, reject) => {
    const worker = new Worker(new URL("./stl.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { cleanup(); if (data.error) reject(data.error === "resource-limit" ? new RangeError() : new Error()); else resolve(data.result); };
    worker.onerror = () => { cleanup(); reject(new Error("STL worker failed")); };
    if (signal.aborted) return abort();
    worker.postMessage(bytes, [bytes]);
  });
  const geometry = new BufferGeometry(); geometry.setAttribute("position", new BufferAttribute(result.positions, 3)); geometry.computeVertexNormals();
  const root = new Group(); root.add(new Mesh(geometry, new MeshStandardMaterial({ color: 0x7b9eb5, side: DoubleSide, roughness: 0.75 })));
  root.userData.origin = result.origin;
  return { root, up: "z" };
}
