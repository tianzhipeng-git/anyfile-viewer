import { ViewerError } from "@anyfile/viewer-protocol";
import { ProtectedBookError } from "./book-source";
/** A per-file worker; abort/dispose terminates synchronous decoders as well. */
export function createBookWorker(worker: Worker, signal: AbortSignal) {
  let next = 0, disposed = false;
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void }>();
  function dispose(error: Error = new DOMException("Aborted", "AbortError")) {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener("abort", abort);
    worker.terminate();
    for (const task of pending.values()) { task.cleanup(); task.reject(error); }
    pending.clear();
  }
  const abort = () => dispose();
  signal.addEventListener("abort", abort, { once: true });
  worker.onerror = () => dispose(new ViewerError("open-failed", "Book worker failed."));
  worker.onmessage = ({ data }) => {
    const task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id); task.cleanup();
    if (data.error) task.reject(data.error === "protected" ? new ProtectedBookError() : new ViewerError(data.error, "Book decoder failed."));
    else task.resolve(data.result);
  };
  return {
    dispose,
    request<T>(message: object, requestSignal = signal): Promise<T> {
      if (disposed || signal.aborted || requestSignal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
      const id = ++next;
      return new Promise<T>((resolve, reject) => {
        const cancel = () => { pending.delete(id); cleanup(); reject(new DOMException("Aborted", "AbortError")); };
        const timer = setTimeout(() => dispose(new ViewerError("resource-limit", "Book decode time limit exceeded.")), 60_000);
        const cleanup = () => { clearTimeout(timer); requestSignal.removeEventListener("abort", cancel); };
        pending.set(id, { resolve: value => resolve(value as T), reject, cleanup });
        requestSignal.addEventListener("abort", cancel, { once: true });
        try { worker.postMessage({ ...message, id }); } catch { dispose(new ViewerError("open-failed", "Book worker failed.")); }
      });
    },
  };
}
