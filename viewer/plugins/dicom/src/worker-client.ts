import { ViewerError } from "@anyfile/viewer-protocol";
import type { DicomInfo, RenderedFrame, WindowSettings, WorkerRequest, WorkerResponse } from "./types";

export class DicomWorker {
  private readonly worker: Worker;
  private id = 0;
  private disposed = false;
  private pending = new Map<number, { resolve: (response: WorkerResponse) => void; reject: (error: unknown) => void }>();

  constructor(private readonly signal: AbortSignal) {
    signal.throwIfAborted();
    this.worker = new Worker(new URL("./decoder-worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      this.pending.delete(response.id);
      if (response.type === "error") pending?.reject(new ViewerError(response.code, "DICOM operation failed."));
      else pending?.resolve(response);
    };
    this.worker.onerror = () => this.close(new ViewerError("open-failed", "DICOM worker failed."));
    this.worker.onmessageerror = () => this.close(new ViewerError("open-failed", "DICOM worker message failed."));
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  async open(file: File): Promise<DicomInfo> {
    const response = await this.request({ id: ++this.id, type: "open", file });
    if (response.type !== "info") throw new ViewerError("open-failed", "Invalid worker response.");
    return response.info;
  }

  async frame(frame: number, window?: WindowSettings): Promise<RenderedFrame> {
    const response = await this.request({ id: ++this.id, type: "frame", frame, window });
    if (response.type !== "frame") throw new ViewerError("open-failed", "Invalid worker response.");
    return response.result;
  }

  private request(request: WorkerRequest): Promise<WorkerResponse> {
    if (this.disposed || this.signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      try { this.worker.postMessage(request); }
      catch (error) { this.pending.delete(request.id); reject(error); }
    });
  }

  private close(error: unknown) {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener("abort", this.dispose);
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  readonly dispose = () => this.close(new DOMException("Aborted", "AbortError"));
}
