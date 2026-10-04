import type { SceneData } from "./scene-types";
export function readScene(bytes: ArrayBuffer, format: "fbx" | "dae", signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<SceneData>((resolve, reject) => {
    const worker = new Worker(new URL("./scene.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); worker.onmessage = worker.onerror = null; worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    const timeout = setTimeout(() => { cleanup(); reject(new RangeError("Scene parser time budget")); }, 120_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { cleanup(); if (data.error) reject(data.error === "resource-limit" ? new RangeError("Scene parser budget") : new Error("Invalid scene")); else resolve(data.result); };
    worker.onerror = () => { cleanup(); reject(new Error("Scene parser failed")); };
    try { worker.postMessage({ bytes, format }, [bytes]); } catch (error) { cleanup(); reject(error); }
  });
}
