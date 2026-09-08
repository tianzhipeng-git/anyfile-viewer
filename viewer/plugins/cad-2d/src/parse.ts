import type { CadScene } from "./scene";
export function readCadScene(source: string, signal: AbortSignal): Promise<CadScene | undefined> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./scene.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => { cleanup(); if (data.error) reject(data.error === "resource-limit" ? new RangeError() : new Error()); else resolve(data.scene); };
    worker.onerror = () => { cleanup(); reject(new Error("DXF worker failed")); };
    if (signal.aborted) return abort();
    worker.postMessage(source);
  });
}
