import { createWorkerRpcClient, type WorkerRpcClient } from "@anyfile/runtime-assets";

import type { PhotoshopWorkerRequest, PhotoshopWorkerResponse } from "./types";

export class PhotoshopDecoderWorker {
  private worker?: Worker;
  private rpc?: WorkerRpcClient<PhotoshopWorkerRequest, PhotoshopWorkerResponse>;
  private nextId = 1;

  constructor(private readonly signal: AbortSignal) {}

  decode(file: File): Promise<Extract<PhotoshopWorkerResponse, { type: "decoded" }>> {
    const rpc = this.ensureRpc();
    return rpc.send(
      { type: "decode", id: this.nextId++, file },
      { expectedType: "decoded" },
    );
  }

  private ensureRpc(): WorkerRpcClient<PhotoshopWorkerRequest, PhotoshopWorkerResponse> {
    if (this.rpc) return this.rpc;
    if (this.signal.aborted) {
      throw new DOMException("Viewer operation aborted.", "AbortError");
    }
    this.worker = new Worker(new URL("./decoder-worker.ts", import.meta.url), { type: "module" });
    this.rpc = createWorkerRpcClient<PhotoshopWorkerRequest, PhotoshopWorkerResponse>(this.worker, {
      signal: this.signal,
      workerError: () => ({ code: "invalid-file", message: "Photoshop decoder worker failed." }),
    });
    return this.rpc;
  }

  readonly dispose = () => {
    this.rpc?.dispose();
    this.rpc = undefined;
    this.worker?.terminate();
    this.worker = undefined;
  };
}
