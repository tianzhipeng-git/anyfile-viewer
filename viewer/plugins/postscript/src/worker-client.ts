import { initializeRuntimeFromSources } from "@anyfile/runtime-assets";
import { createWorkerRpcClient, type WorkerRpcClient } from "@anyfile/runtime-assets";
import { ViewerError } from "@anyfile/viewer-protocol";

import { STET_ASSET_SOURCES } from "./runtime";
import type {
  PostscriptWorkerRequest,
  PostscriptWorkerResponse,
} from "./types";

const OPERATION_TIMEOUT_MS = 20_000;

export class PostscriptWorkerClient {
  private readonly rpc: WorkerRpcClient<PostscriptWorkerRequest, PostscriptWorkerResponse>;
  private nextId = 1;

  constructor(private readonly signal: AbortSignal) {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.rpc = createWorkerRpcClient<PostscriptWorkerRequest, PostscriptWorkerResponse>(worker, {
      signal,
      defaultTimeoutMs: OPERATION_TIMEOUT_MS,
      timeoutError: () => ({ code: "resource-limit", message: "PostScript processing exceeded the time limit." }),
      workerError: () => ({ code: "open-failed", message: "PostScript Worker failed." }),
    });
  }

  async initialize(source: (typeof STET_ASSET_SOURCES)[number]) {
    await this.rpc.send(
      {
        type: "init",
        id: this.nextId++,
        runtimeUrl: source.runtimeUrl,
        wasmUrl: source.wasmUrl,
      },
      { expectedType: "ready" },
    );
  }

  async open(buffer: ArrayBuffer, fileName: string) {
    return this.rpc.send(
      { type: "open", id: this.nextId++, buffer, fileName },
      { expectedType: "opened", transfer: [buffer] },
    );
  }

  async render(pageIndex: number, width: number, height: number) {
    return this.rpc.send(
      { type: "render", id: this.nextId++, pageIndex, width, height },
      { expectedType: "rendered" },
    );
  }

  async step() {
    return this.rpc.send({ type: "step", id: this.nextId++ }, { expectedType: "stepped" });
  }

  get disposed() {
    return this.rpc.disposed;
  }

  readonly dispose = () => {
    this.rpc.dispose();
  };
}

export async function createPostscriptWorkerClient(signal: AbortSignal) {
  try {
    return await initializeRuntimeFromSources({
      signal,
      sources: STET_ASSET_SOURCES.map((source) => ({ name: source.name, value: source })),
      errorMessage: "Unable to initialize PostScript from R2 or local assets.",
      abortMessage: "Viewer operation aborted.",
      async createAttempt(source) {
        const client = new PostscriptWorkerClient(signal);
        return {
          async initialize() {
            await client.initialize(source.value);
            return client;
          },
          dispose() { client.dispose(); },
        };
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ViewerError(
      "open-failed",
      "Unable to initialize PostScript from R2 or local assets.",
      { cause: error },
    );
  }
}
