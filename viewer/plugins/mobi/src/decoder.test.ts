// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import type { MobiResult } from "./publication";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it.each(["mobi7.mobi", "uncompressed.mobi", "huffman.mobi", "kf8.azw3", "joint.mobi", "palmdoc.pdb"])("decodes %s with the shipped WASM and reads chapters", async name => {
  const postMessage = vi.fn();
  const worker = { postMessage, onmessage: undefined as unknown as (event: { data: object }) => Promise<void> };
  vi.stubGlobal("self", worker);
  await import("./decoder.worker");
  const file = new File([readFileSync(resolve("../../../docs/ebooks/fixtures/phase45", name))], name);
  const runtime = pathToFileURL(resolve("../../../third_party/libmobi/0.12-anyfile.2/mobi.js")).href;
  await worker.onmessage({ data: { id: 1, type: "open", file, runtime } });
  const reply = postMessage.mock.calls[0][0];
  expect(reply.error).toBeUndefined();
  const result = reply.result as MobiResult;
  const chapter = result.entries.find(entry => entry.filename.startsWith("part"));
  expect(chapter).toBeDefined();
  await worker.onmessage({ data: { id: 2, type: "read", path: chapter!.filename, limit: 2 * 1024 ** 2 } });
  expect(postMessage.mock.calls[1][0].result).toHaveLength(chapter!.uncompressedSize);
  await worker.onmessage({ data: { id: 3, type: "read", path: chapter!.filename, limit: 0 } });
  expect(postMessage.mock.calls[2][0].error).toBe("resource-limit");
});
