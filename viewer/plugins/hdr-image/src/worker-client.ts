import { createWorkerRpcClient, type WorkerRpcClient } from "@anyfile/runtime-assets";
import { abortError } from "@anyfile/viewer-protocol";
import type { HdrDecodedFrame, HdrWorkerRequest, HdrWorkerResponse } from "./types";

export interface HdrDecoderSession {
  open(file: File): Promise<HdrDecodedFrame>;
  select(partIndex: number, layerId: string): Promise<HdrDecodedFrame>;
  dispose(): void;
}

export class HdrDecoderWorkerClient implements HdrDecoderSession {
  private worker?: Worker;
  private rpc?: WorkerRpcClient<HdrWorkerRequest, HdrWorkerResponse>;
  private nextId = 1;

  constructor(private readonly signal: AbortSignal) {}

  async open(file: File): Promise<HdrDecodedFrame> {
    const rpc = this.ensureRpc();
    const response = await rpc.send(
      { id: this.nextId++, type: "open", file },
      { expectedType: "frame" },
    );
    return response.frame;
  }

  async select(partIndex: number, layerId: string): Promise<HdrDecodedFrame> {
    const rpc = this.ensureRpc();
    const response = await rpc.send(
      { id: this.nextId++, type: "select", partIndex, layerId },
      { expectedType: "frame" },
    );
    return response.frame;
  }

  private ensureRpc(): WorkerRpcClient<HdrWorkerRequest, HdrWorkerResponse> {
    if (this.rpc) return this.rpc;
    if (this.signal.aborted) throw abortError();
    this.worker = new Worker(new URL("./decoder-worker.ts", import.meta.url), { type: "module" });
    this.rpc = createWorkerRpcClient<HdrWorkerRequest, HdrWorkerResponse>(this.worker, {
      signal: this.signal,
      workerError: () => ({ code: "open-failed", message: "HDR decoder worker failed." }),
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
