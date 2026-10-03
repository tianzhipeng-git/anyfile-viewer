import { selectMessages, type OpenViewerContext } from "@anyfile/viewer-protocol";
import { loadGltf } from "./gltf";

export async function loadSkp(bytes: ArrayBuffer, context: OpenViewerContext) {
  const { signal } = context;
  const glb = await new Promise<ArrayBuffer>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const worker = new Worker(new URL("./skp.worker.ts", import.meta.url), { type: "module" });
    const cleanup = () => { clearTimeout(timeout); signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { cleanup(); reject(new DOMException("Aborted", "AbortError")); };
    const timeout = setTimeout(() => { cleanup(); reject(new RangeError("SKP parsing time budget")); }, 60_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      cleanup();
      if (data.error) reject(data.error === "resource-limit" ? new RangeError() : new Error("Invalid SKP"));
      else resolve(data.result);
    };
    worker.onerror = () => { cleanup(); reject(new Error("SKP worker failed")); };
    try { worker.postMessage(bytes, [bytes]); } catch (error) { cleanup(); reject(error); }
  });
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  const document = await loadGltf(glb, context);
  const note = selectMessages(context.locale, {
    en: "SketchUp geometry preview; annotations, styles and saved views are not reproduced.",
    "zh-CN": "SketchUp 几何预览；不复现标注、样式与保存视图。",
  });
  return { ...document, description: [note, document.description].filter(Boolean).join(" ") };
}
