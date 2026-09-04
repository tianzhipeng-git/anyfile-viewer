import { ViewerError } from "@anyfile/viewer-protocol";

import { abortError } from "./read-blob";
import { STET_ASSET_SOURCES } from "./runtime";
import type {
  PostscriptWorkerRequest,
  PostscriptWorkerResponse,
} from "./types";

const OPERATION_TIMEOUT_MS = 20_000;

export class PostscriptWorkerClient {
  private readonly worker: Worker;
  private nextId = 1;
  private disposed = false;
  private readonly cancellations = new Set<() => void>();

  constructor(private readonly signal: AbortSignal) {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  async initialize(source: (typeof STET_ASSET_SOURCES)[number]) {
    await this.request({
      type: "init",
      id: this.nextId++,
      runtimeUrl: source.runtimeUrl,
      wasmUrl: source.wasmUrl,
    }, "ready");
  }

  async open(buffer: ArrayBuffer, fileName: string) {
    return this.request(
      { type: "open", id: this.nextId++, buffer, fileName },
      "opened",
      [buffer],
    );
  }

  async render(pageIndex: number, width: number, height: number) {
    return this.request(
      { type: "render", id: this.nextId++, pageIndex, width, height },
      "rendered",
    );
  }

  async step() {
    return this.request({ type: "step", id: this.nextId++ }, "stepped");
  }

  private request<T extends PostscriptWorkerResponse["type"]>(
    request: PostscriptWorkerRequest,
    expectedType: T,
    transfer: Transferable[] = [],
  ): Promise<Extract<PostscriptWorkerResponse, { type: T }>> {
    if (this.disposed || this.signal.aborted) return Promise.reject(abortError());
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.cancellations.delete(cancel);
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onWorkerError);
        this.signal.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      const onWorkerError = () => {
        cleanup();
        this.dispose();
        reject(new ViewerError("open-failed", "PostScript Worker failed."));
      };
      const onMessage = (event: MessageEvent<PostscriptWorkerResponse>) => {
        if (!("id" in event.data) || event.data.id !== request.id) return;
        cleanup();
        if (event.data.type === expectedType) {
          resolve(event.data as Extract<PostscriptWorkerResponse, { type: T }>);
        } else if (event.data.type === "error") {
          reject(new ViewerError(event.data.code, event.data.message));
        }
      };
      const timeout = setTimeout(() => {
        cleanup();
        this.dispose();
        reject(new ViewerError("resource-limit", "PostScript processing exceeded the time limit."));
      }, OPERATION_TIMEOUT_MS);
      const cancel = () => {
        cleanup();
        reject(abortError());
      };
      this.cancellations.add(cancel);
      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onWorkerError);
      this.signal.addEventListener("abort", onAbort, { once: true });
      this.worker.postMessage(request, transfer);
    });
  }

  readonly dispose = () => {
    if (this.disposed) return;
    this.disposed = true;
    this.signal.removeEventListener("abort", this.dispose);
    for (const cancel of [...this.cancellations]) cancel();
    this.worker.terminate();
  };
}

export async function createPostscriptWorkerClient(signal: AbortSignal) {
  const errors: unknown[] = [];
  for (const source of STET_ASSET_SOURCES) {
    if (signal.aborted) throw abortError();
    let client: PostscriptWorkerClient | undefined;
    try {
      client = new PostscriptWorkerClient(signal);
      await client.initialize(source);
      return client;
    } catch (error) {
      client?.dispose();
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      errors.push(error);
    }
  }
  throw new ViewerError(
    "open-failed",
    "Unable to initialize PostScript from jsDelivr, R2, or local assets.",
    { cause: new AggregateError(errors) },
  );
}
