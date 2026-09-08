import { ViewerError } from "@anyfile/viewer-protocol";

import type { PhotoshopWorkerRequest, PhotoshopWorkerResponse } from "./types";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

export class PhotoshopDecoderWorker {
  private worker?: Worker;
  private nextId = 1;
  private disposed = false;

  constructor(private readonly signal: AbortSignal) {
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  decode(file: File): Promise<Extract<PhotoshopWorkerResponse, { type: "decoded" }>> {
    if (this.disposed || this.signal.aborted) return Promise.reject(abortError());
    const worker = this.worker ??= new Worker(new URL("./decoder-worker.ts", import.meta.url), { type: "module" });
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        this.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => { cleanup(); this.dispose(); reject(abortError()); };
      const onError = () => { cleanup(); reject(new ViewerError("invalid-file", "Photoshop decoder worker failed.")); };
      const onMessage = (event: MessageEvent<PhotoshopWorkerResponse>) => {
        if (event.data.id !== id) return;
        cleanup();
        if (event.data.type === "decoded") resolve(event.data);
        else reject(new ViewerError(event.data.code, event.data.message));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      this.signal.addEventListener("abort", onAbort, { once: true });
      const request: PhotoshopWorkerRequest = { type: "decode", id, file };
      worker.postMessage(request);
    });
  }

  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener("abort", this.dispose);
    this.worker?.terminate();
    this.worker = undefined;
  };
}
