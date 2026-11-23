import { createWorkerRpcClient, type WorkerRpcClient } from "@anyfile/runtime-assets";
import type { Request, Response, StatFormat } from "./types";
import { RUNTIME_BASE } from "./types";

const INIT_TIMEOUT = 30_000;
/** A page re-parses from the start of compressed data, so later pages of huge files take longer. */
const OPERATION_TIMEOUT = 120_000;

export class StatWorkerClient {
  private readonly rpc: WorkerRpcClient<Request, Response>;
  private nextId = 1;
  constructor(signal: AbortSignal) {
    const worker = new Worker(new URL("./kernel.worker.ts", import.meta.url), { type: "module" });
    this.rpc = createWorkerRpcClient<Request, Response>(worker, {
      signal,
      workerError: (request) => ({ code: request.type === "init" ? "unsupported-environment" : "invalid-file", message: "ReadStat Worker failed." }),
    });
  }
  async initialize() {
    await this.send({ id: this.nextId++, type: "init", baseUrl: new URL(RUNTIME_BASE, location.origin).href }, "ready", INIT_TIMEOUT);
  }
  async open(file: Blob, format: StatFormat) {
    return (await this.send({ id: this.nextId++, type: "open", file, format }, "schema")).schema;
  }
  async rows(offset: number, limit: number, firstColumn: number, lastColumn: number) {
    return (await this.send({ id: this.nextId++, type: "rows", offset, limit, firstColumn, lastColumn }, "rows")).rows;
  }
  dispose() { this.rpc.dispose(); }
  private send<T extends Response["type"]>(request: Request, expectedType: T, timeoutMs = OPERATION_TIMEOUT) {
    return this.rpc.send(request, { expectedType, timeoutMs });
  }
}
