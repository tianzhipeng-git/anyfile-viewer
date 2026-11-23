import { initializeRuntimeFromSources } from "@anyfile/runtime-assets";
import { createWorkerRpcClient, type WorkerRpcClient } from "@anyfile/runtime-assets";
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
  private readonly rpc: WorkerRpcClient<DjvuWorkerRequest, DjvuWorkerResponse>;
  private nextId = 1;

  constructor(private readonly signal: AbortSignal) {
    const worker = new Worker(new URL("./decoder.worker.ts", import.meta.url), { type: "module" });
    this.rpc = createWorkerRpcClient<DjvuWorkerRequest, DjvuWorkerResponse>(worker, {
      signal,
      timeoutError: (request) => ({
        code: request.type === "init" ? "unsupported-environment" : "resource-limit",
        message:
          request.type === "init"
            ? "DjVu runtime initialization timed out."
            : "DjVu operation exceeded the time limit.",
      }),
      workerError: () => ({ code: "open-failed", message: "DjVu Worker failed." }),
    });
  }

  async initialize(source: (typeof DJVU_ASSET_SOURCES)[number]) {
    await this.rpc.send(
      {
        type: "init",
        id: this.nextId++,
        runtimeUrl: resolveAssetUrl(source.runtimeUrl),
        wasmUrl: resolveAssetUrl(source.wasmUrl),
      },
      { expectedType: "ready", timeoutMs: DJVU_LIMITS.initTimeoutMs },
    );
  }

  async open(buffer: ArrayBuffer): Promise<DjvuOpenResult> {
    const response = await this.rpc.send(
      { type: "open", id: this.nextId++, buffer },
      { expectedType: "opened", transfer: [buffer], timeoutMs: DJVU_LIMITS.operationTimeoutMs },
    );
    return response.document;
  }

  async renderPage(
    pageIndex: number,
    width: number,
    height: number,
    options: { thumbnail?: boolean; signal?: AbortSignal } = {},
  ): Promise<{ width: number; height: number; rgba: ArrayBuffer }> {
    const response = await this.rpc.send(
      {
        type: "render",
        id: this.nextId++,
        pageIndex,
        width,
        height,
        thumbnail: options.thumbnail,
      },
      { expectedType: "rendered", timeoutMs: DJVU_LIMITS.operationTimeoutMs, signal: options.signal },
    );
    return { width: response.width, height: response.height, rgba: response.rgba };
  }

  async getPageText(pageIndex: number, callSignal?: AbortSignal): Promise<DjvuPageText | null> {
    const response = await this.rpc.send(
      { type: "text", id: this.nextId++, pageIndex },
      { expectedType: "text", timeoutMs: DJVU_LIMITS.operationTimeoutMs, signal: callSignal },
    );
    return response.pageText;
  }

  get disposed() {
    return this.rpc.disposed;
  }

  readonly dispose = () => {
    this.rpc.dispose();
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
