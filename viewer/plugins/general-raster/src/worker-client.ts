import { createWorkerRpcClient, type WorkerRpcClient } from "@anyfile/runtime-assets";

import type { DecodedRaster, WorkerRequest, WorkerResponse } from "./types";

export class RasterDecoderWorker {
  private worker?: Worker;
  private rpc?: WorkerRpcClient<WorkerRequest, WorkerResponse>;
  private nextId = 1;

  constructor(private readonly signal: AbortSignal) {}

  decode(file: File, pageIndex: number): Promise<DecodedRaster> {
    const rpc = this.ensureRpc();
    return rpc
      .send({ type: "decode", id: this.nextId++, file, pageIndex }, { expectedType: "result" })
      .then((response) => response.raster);
  }

  private ensureRpc(): WorkerRpcClient<WorkerRequest, WorkerResponse> {
    if (this.rpc) return this.rpc;
    if (this.signal.aborted) {
      throw new DOMException("Viewer operation aborted.", "AbortError");
    }
    this.worker = new Worker(new URL("./decoder-worker.ts", import.meta.url), { type: "module" });
    this.rpc = createWorkerRpcClient<WorkerRequest, WorkerResponse>(this.worker, {
      signal: this.signal,
      workerError: () => ({ code: "invalid-file", message: "图片解码 Worker 失败。" }),
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
