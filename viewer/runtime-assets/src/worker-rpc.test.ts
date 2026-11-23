import { ViewerError, type ViewerErrorCode } from "@anyfile/viewer-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorkerRpcClient, type WorkerRpcRequest } from "./worker-rpc";

type Req = { type: "init"; id: number } | { type: "read"; id: number };

type Res =
  | { type: "ready"; id: number }
  | { type: "value"; id: number; payload: number }
  | { type: "error"; id: number; code: ViewerErrorCode; message: string };

class MockWorker extends EventTarget {
  static instances: MockWorker[] = [];
  terminated = false;
  posted: { request: WorkerRpcRequest; transfer?: Transferable[] }[] = [];

  constructor() {
    super();
    MockWorker.instances.push(this);
  }

  postMessage(request: WorkerRpcRequest, transfer?: Transferable[]) {
    this.posted.push({ request, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  reply(data: Res) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

function setup(overrides: Partial<Parameters<typeof createWorkerRpcClient<Req, Res>>[1]> = {}) {
  const worker = new MockWorker();
  const controller = new AbortController();
  const client = createWorkerRpcClient<Req, Res>(worker as unknown as Worker, {
    signal: controller.signal,
    ...overrides,
  });
  return { worker, controller, client };
}

afterEach(() => {
  MockWorker.instances = [];
  vi.useRealTimers();
});

describe("createWorkerRpcClient", () => {
  it("resolves the response matching the request id and expected type", async () => {
    const { worker, client } = setup();
    const pending = client.send({ type: "read", id: 7 }, { expectedType: "value" });
    worker.reply({ type: "value", id: 8, payload: 0 });
    worker.reply({ type: "value", id: 7, payload: 42 });
    await expect(pending).resolves.toEqual({ type: "value", id: 7, payload: 42 });
  });

  it("forwards transferables to postMessage", async () => {
    const { worker, client } = setup();
    const buffer = new ArrayBuffer(8);
    void client.send({ type: "read", id: 1 }, { expectedType: "value", transfer: [buffer] });
    expect(worker.posted[0].transfer).toEqual([buffer]);
  });

  it("rejects with the worker's error code and message", async () => {
    const { worker, client } = setup();
    const pending = client.send({ type: "read", id: 1 }, { expectedType: "value" });
    worker.reply({ type: "error", id: 1, code: "invalid-file", message: "boom" });
    await expect(pending).rejects.toMatchObject({ code: "invalid-file", message: "boom" });
  });

  it("rejects on timeout and disposes the worker", async () => {
    vi.useFakeTimers();
    const { worker, client } = setup({ defaultTimeoutMs: 1000 });
    const pending = client.send({ type: "read", id: 1 }, { expectedType: "value" });
    vi.advanceTimersByTime(1000);
    await expect(pending).rejects.toBeInstanceOf(ViewerError);
    expect(client.disposed).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  it("aborts the whole client when its signal aborts, terminating in-flight requests", async () => {
    const { worker, controller, client } = setup();
    const pending = client.send({ type: "read", id: 1 }, { expectedType: "value" });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);
  });

  it("aborts a single call via its own signal without terminating the worker", async () => {
    const { worker, client } = setup();
    const call = new AbortController();
    const pending = client.send({ type: "read", id: 1 }, { expectedType: "value", signal: call.signal });
    call.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(client.disposed).toBe(false);
    expect(worker.terminated).toBe(false);
  });

  it("matches by id-agnostic responses when expectId is false", async () => {
    const worker = new MockWorker();
    const client = createWorkerRpcClient<Req, Res>(worker as unknown as Worker, { signal: new AbortController().signal, expectId: false });
    const pending = client.send({ type: "read", id: 1 }, { expectedType: "value" });
    worker.reply({ type: "value", id: 99, payload: 3 });
    await expect(pending).resolves.toEqual({ type: "value", id: 99, payload: 3 });
  });

  it("dispose is idempotent and cancels pending requests", async () => {
    const { worker, client } = setup();
    const pending = client.send({ type: "read", id: 1 }, { expectedType: "value" });
    client.dispose();
    client.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);
  });
});
