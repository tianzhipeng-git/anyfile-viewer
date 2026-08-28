import { ViewerError } from "@anyfile/viewer-protocol";
import { abortError } from "./read-blob";
import type { JxlWorkerRequest, JxlWorkerResponse } from "./types";

export class JxlDecoderWorker {
  private readonly worker: Worker;
  private nextId = 1;
  private disposed = false;

  constructor(private readonly signal: AbortSignal) {
    this.worker = new Worker(new URL("./decoder-worker.ts", import.meta.url), { type: "module" });
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  open(file: File) {
    return this.request({ type: "open", id: this.nextId++, file });
  }

  render(frameIndex: number) {
    return this.request({ type: "render", id: this.nextId++, frameIndex });
  }

  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener("abort", this.dispose);
    this.worker.terminate();
  };

  private request(request: JxlWorkerRequest): Promise<Extract<JxlWorkerResponse, { type: "opened" | "frame" }>> {
    if (this.disposed || this.signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onError);
        this.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => { cleanup(); reject(abortError()); };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new ViewerError("invalid-file", event.message ? `JPEG XL Worker 失败：${event.message}` : "JPEG XL Worker 失败。"));
      };
      const onMessage = (event: MessageEvent<JxlWorkerResponse>) => {
        if (event.data.id !== request.id) return;
        cleanup();
        if (event.data.type === "error") reject(new ViewerError(event.data.code, event.data.message));
        else resolve(event.data);
      };
      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onError);
      this.signal.addEventListener("abort", onAbort, { once: true });
      this.worker.postMessage(request);
    });
  }
}
