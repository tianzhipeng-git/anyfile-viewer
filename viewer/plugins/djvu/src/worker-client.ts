import { initializeRuntimeFromSources } from "@anyfile/runtime-assets";
import { ViewerError } from "@anyfile/viewer-protocol";
import { DJVU_LIMITS } from "./limits";
import { DJVU_ASSET_SOURCES } from "./runtime";
import type {
  DjvuOpenResult,
  DjvuPageText,
  DjvuWorkerRequest,
  DjvuWorkerResponse,
} from "./types";

function abortError() {
  return new DOMException("Viewer operation aborted.", "AbortError");
}

function resolveAssetUrl(path: string): string {
  if (typeof location !== "undefined" && location.origin && location.origin !== "null") {
    return new URL(path, location.origin).href;
  }
  return path;
}

export class DjvuWorkerClient {
  private readonly worker: Worker;
  private nextId = 1;
  private disposed = false;
  private readonly cancellations = new Set<() => void>();

  constructor(private readonly signal: AbortSignal) {
    this.worker = new Worker(new URL("./decoder.worker.ts", import.meta.url), { type: "module" });
    signal.addEventListener("abort", this.dispose, { once: true });
  }

  async initialize(source: (typeof DJVU_ASSET_SOURCES)[number]) {
    await this.request(
      {
        type: "init",
        id: this.nextId++,
        runtimeUrl: resolveAssetUrl(source.runtimeUrl),
        wasmUrl: resolveAssetUrl(source.wasmUrl),
      },
      "ready",
      [],
      DJVU_LIMITS.initTimeoutMs,
    );
  }

  async open(buffer: ArrayBuffer): Promise<DjvuOpenResult> {
    const response = await this.request(
      { type: "open", id: this.nextId++, buffer },
      "opened",
      [buffer],
      DJVU_LIMITS.operationTimeoutMs,
    );
    return response.document;
  }

  async renderPage(
    pageIndex: number,
    width: number,
    height: number,
    options: { thumbnail?: boolean; signal?: AbortSignal } = {},
  ): Promise<{ width: number; height: number; rgba: ArrayBuffer }> {
    const response = await this.request(
      {
        type: "render",
        id: this.nextId++,
        pageIndex,
        width,
        height,
        thumbnail: options.thumbnail,
      },
      "rendered",
      [],
      DJVU_LIMITS.operationTimeoutMs,
      options.signal,
    );
    return { width: response.width, height: response.height, rgba: response.rgba };
  }

  async getPageText(pageIndex: number, callSignal?: AbortSignal): Promise<DjvuPageText | null> {
    const response = await this.request(
      { type: "text", id: this.nextId++, pageIndex },
      "text",
      [],
      DJVU_LIMITS.operationTimeoutMs,
      callSignal,
    );
    return response.pageText;
  }

  private request<T extends DjvuWorkerResponse["type"]>(
    request: DjvuWorkerRequest,
    expectedType: T,
    transfer: Transferable[],
    timeoutMs: number,
    callSignal?: AbortSignal,
  ): Promise<Extract<DjvuWorkerResponse, { type: T }>> {
    if (this.disposed || this.signal.aborted || callSignal?.aborted) {
      return Promise.reject(abortError());
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.cancellations.delete(cancel);
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onWorkerError);
        this.signal.removeEventListener("abort", onAbort);
        callSignal?.removeEventListener("abort", onCallAbort);
      };
      const onAbort = () => {
        cleanup();
        reject(abortError());
      };
      const onCallAbort = () => {
        cleanup();
        reject(abortError());
      };
      const onWorkerError = () => {
        cleanup();
        this.dispose();
        reject(new ViewerError("open-failed", "DjVu Worker failed."));
      };
      const onMessage = (event: MessageEvent<DjvuWorkerResponse>) => {
        if (!("id" in event.data) || event.data.id !== request.id) return;
        cleanup();
        if (event.data.type === expectedType) {
          resolve(event.data as Extract<DjvuWorkerResponse, { type: T }>);
        } else if (event.data.type === "error") {
          reject(new ViewerError(event.data.code, event.data.message));
        }
      };
      const timeout = setTimeout(() => {
        cleanup();
        this.dispose();
        reject(
          new ViewerError(
            request.type === "init" ? "unsupported-environment" : "resource-limit",
            request.type === "init"
              ? "DjVu runtime initialization timed out."
              : "DjVu operation exceeded the time limit.",
          ),
        );
      }, timeoutMs);
      const cancel = () => {
        cleanup();
        reject(abortError());
      };
      this.cancellations.add(cancel);
      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onWorkerError);
      this.signal.addEventListener("abort", onAbort, { once: true });
      callSignal?.addEventListener("abort", onCallAbort, { once: true });
      try {
        this.worker.postMessage(request, transfer);
      } catch (error) {
        cleanup();
        reject(error);
      }
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

export async function createDjvuWorkerClient(signal: AbortSignal, unsupportedMessage: string) {
  try {
    return await initializeRuntimeFromSources({
      signal,
      sources: DJVU_ASSET_SOURCES.map((source) => ({ name: source.name, value: source })),
      errorMessage: unsupportedMessage,
      abortMessage: "Viewer operation aborted.",
      async createAttempt(source) {
        const client = new DjvuWorkerClient(signal);
        return {
          async initialize() {
            await client.initialize(source.value);
            return client;
          },
          dispose() {
            client.dispose();
          },
        };
      },
    });
  } catch (error) {
    if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw abortError();
    }
    throw new ViewerError("unsupported-environment", unsupportedMessage, { cause: error });
  }
}
