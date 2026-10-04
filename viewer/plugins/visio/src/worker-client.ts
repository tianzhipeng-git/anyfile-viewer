import { ViewerError } from "@anyfile/viewer-protocol";
import type { Copy } from "./messages";
import { RUNTIME_BASE, type Request, type Response } from "./types";

export class VisioWorkerClient {
  private readonly worker = new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module" });
  private disposed = false;
  private cancel?: () => void;
  constructor(private readonly signal: AbortSignal, private readonly copy: Copy) {
    signal.addEventListener("abort", this.dispose, { once: true });
  }
  async initialize() {
    await this.request({ type: "init", baseUrl: new URL(RUNTIME_BASE, location.origin).href });
  }
  async open(bytes: ArrayBuffer) {
    const response = await this.request({ type: "open", bytes }, [bytes]);
    if (response.type !== "opened") throw new ViewerError("open-failed", this.copy.invalid);
    return response.pages;
  }
  async page(index: number) {
    const response = await this.request({ type: "page", index });
    if (response.type !== "page") throw new ViewerError("invalid-file", this.copy.invalid);
    return response.svg;
  }
  private request(message: Request, transfer: Transferable[] = []): Promise<Response> {
    if (this.disposed || this.signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.worker.onmessage = null; this.worker.onerror = null; this.cancel = undefined; };
      const fail = (error: unknown) => { cleanup(); reject(error); };
      const timer = setTimeout(() => {
        fail(new ViewerError(message.type === "init" ? "unsupported-environment" : "resource-limit", message.type === "init" ? this.copy.unsupported : this.copy.limit));
        this.dispose();
      }, 30_000);
      this.cancel = () => fail(new DOMException("Aborted", "AbortError"));
      this.worker.onerror = () => fail(new ViewerError(message.type === "init" ? "unsupported-environment" : "invalid-file", message.type === "init" ? this.copy.unsupported : this.copy.invalid));
      this.worker.onmessage = ({ data }: MessageEvent<Response>) => {
        cleanup();
        if (data.type === "error") {
          const text = data.code === "resource-limit" ? this.copy.limit : data.code === "unsupported-environment" ? this.copy.unsupported : this.copy.invalid;
          reject(new ViewerError(data.code, text));
        } else resolve(data);
      };
      try { this.worker.postMessage(message, transfer); } catch (error) { fail(error); }
    });
  }
  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener("abort", this.dispose);
    this.cancel?.();
    this.worker.terminate();
  };
}
