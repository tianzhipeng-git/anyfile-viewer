import { ViewerError } from "@anyfile/viewer-protocol";
import { abortError } from "./read-blob";
import type { HeifWorkerRequest, HeifWorkerResponse } from "./types";

export class HeifDecoderWorker {
  private readonly worker: Worker;
  private disposed = false;
  private rejectPending?: (reason: unknown) => void;

  constructor(private readonly signal: AbortSignal) {
    this.worker = new Worker(new URL("./heif-worker.ts", import.meta.url), { type: "module" });
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  decode(file: File) {
    const request: HeifWorkerRequest = { type: "decode", id: 1, file };
    if (this.disposed || this.signal.aborted) return Promise.reject(abortError());
    return new Promise<Extract<HeifWorkerResponse, { type: "decoded" }>>((resolve, reject) => {
      const cleanup = () => {
        this.rejectPending = undefined;
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onError);
        this.signal.removeEventListener("abort", onAbort);
      };
      const rejectRequest = (reason: unknown) => { cleanup(); reject(reason); };
      const onAbort = () => rejectRequest(abortError());
      const onError = () => rejectRequest(new ViewerError("open-failed", "HEIF Worker 无法启动。"));
      const onMessage = (event: MessageEvent<HeifWorkerResponse>) => {
        if (event.data.id !== request.id) return;
        cleanup();
        if (event.data.type === "error") reject(new ViewerError(event.data.code, event.data.message));
        else resolve(event.data);
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onError);
      this.signal.addEventListener("abort", onAbort, { once: true });
      this.rejectPending = rejectRequest;
      this.worker.postMessage(request);
    });
  }

  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener("abort", this.dispose);
    this.worker.terminate();
    this.rejectPending?.(abortError());
  };
}
