import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaybackClient } from "./client.mjs";

class WorkerStub {
  static instances = [];
  messages = [];
  terminated = false;
  constructor() { WorkerStub.instances.push(this); }
  postMessage(message) { this.messages.push(message); }
  terminate() { this.terminated = true; }
  reply(result, overrides = {}) {
    const { id, generation } = this.messages.at(-1);
    this.onmessage?.({ data: { id, generation, result, ...overrides } });
  }
}
globalThis.Worker = WorkerStub;

test("one in-flight pull bounds the message queue and ignores stale replies", async () => {
  const client = new PlaybackClient("/worker.js");
  const worker = WorkerStub.instances.at(-1);
  const pending = client.request("next");
  await assert.rejects(client.request("next"), /previous/);
  worker.reply("stale", { id: 0 });
  worker.reply("frame");
  assert.equal(await pending, "frame");
  assert.equal(worker.messages.length, 1);
  client.dispose();
});

test("seek advances generation; an old generation cannot resolve a new command", async () => {
  const client = new PlaybackClient("/worker.js");
  const worker = WorkerStub.instances.at(-1);
  const seek = client.request("seek", { time: 2 });
  worker.reply("stale", { generation: 0 }); worker.reply(null);
  assert.equal(await seek, null);
  assert.equal(worker.messages[0].generation, 1);
  client.dispose();
});

test("opening abort terminates the Worker and rejects pending work", async () => {
  const controller = new AbortController();
  const client = new PlaybackClient("/worker.js", controller.signal);
  const worker = WorkerStub.instances.at(-1);
  const pending = client.request("open");
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(worker.terminated, true);
  assert.equal(worker.onmessage, null);
  await assert.rejects(client.request("next"), { name: "AbortError" });
  client.dispose();
});

test("already aborted input never creates a Worker", () => {
  const count = WorkerStub.instances.length;
  assert.throws(() => new PlaybackClient("/worker.js", AbortSignal.abort()), { name: "AbortError" });
  assert.equal(WorkerStub.instances.length, count);
});

test("decode failures keep their error category and release the Worker", async () => {
  const client = new PlaybackClient("/worker.js");
  const worker = WorkerStub.instances.at(-1);
  const pending = client.request("next");
  worker.reply(null, { error: { code: "resource-limit", message: "Budget" } });
  await assert.rejects(pending, { code: "resource-limit" });
  assert.equal(worker.terminated, true);
});

test("a command watchdog terminates synchronous WASM work", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const client = new PlaybackClient("/worker.js");
  const worker = WorkerStub.instances.at(-1);
  const pending = client.request("next");
  context.mock.timers.tick(15000);
  await assert.rejects(pending, { code: "resource-limit" });
  assert.equal(worker.terminated, true);
});
