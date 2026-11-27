// @vitest-environment node
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it } from "vitest";
import { ExtractWorkerPool } from "./worker-pool";

let pool: ExtractWorkerPool | undefined;
afterEach(async () => { await pool?.dispose(); });

describe("ExtractWorkerPool", () => {
  it("does not fail a retry on a fresh worker when the timed-out worker exits", async () => {
    const filePath = resolve(process.cwd(), "../plugins/plist/examples/app-config.binary.plist");
    const { size, mtimeMs } = statSync(filePath);
    const request = { op: "route" as const, filePath, size, mtimeMs };
    pool = new ExtractWorkerPool({ persistent: true });
    await expect(pool.call(request, { timeoutMs: 1 }))
      .rejects.toMatchObject({ code: "timeout" });
    await expect(pool.call(request, { timeoutMs: 15_000 }))
      .resolves.toMatchObject({ pluginId: "apple-plist", capabilities: ["read"] });
  }, 20_000);

  it("rejects immediately when passed a pre-aborted AbortSignal", async () => {
    const filePath = resolve(process.cwd(), "../plugins/plist/examples/app-config.binary.plist");
    const { size, mtimeMs } = statSync(filePath);
    const controller = new AbortController();
    controller.abort();
    pool = new ExtractWorkerPool({ persistent: false });
    await expect(pool.call({ op: "route", filePath, size, mtimeMs }, { signal: controller.signal }))
      .rejects.toMatchObject({ code: "timeout" });
  });

  it("blocks outbound network APIs inside the worker isolate", async () => {
    const tsHooksUrl = new URL("./ts-hooks.mjs", import.meta.url).href;
    const workerModuleUrl = new URL("./worker.ts", import.meta.url).href;
    const script = `
      import { parentPort } from "node:worker_threads";
      import net from "node:net";
      import { installWorkerNetworkGuard } from ${JSON.stringify(workerModuleUrl)};
      installWorkerNetworkGuard();
      console.log("NOISY_WASM_STDOUT_SHOULD_NOT_LEAK");
      const results = {};
      try { await fetch("https://example.com"); results.fetch = "allowed"; } catch (e) { results.fetch = e.code || e.message; }
      try { net.connect({ host: "127.0.0.1", port: 1 }); results.net = "allowed"; } catch (e) { results.net = e.code || e.message; }
      parentPort.postMessage(results);
    `;
    const worker = new Worker(script, {
      eval: true,
      execArgv: ["--import", tsHooksUrl],
      stdout: true,
      stderr: true,
    });
    let capturedStdout = "";
    worker.stdout?.setEncoding("utf8");
    worker.stdout?.on("data", (chunk: string) => { capturedStdout += chunk; });
    const results = await new Promise<Record<string, string>>((resolveFn, rejectFn) => {
      worker.once("message", resolveFn);
      worker.once("error", rejectFn);
    });
    await worker.terminate();
    expect(capturedStdout).toContain("NOISY_WASM_STDOUT_SHOULD_NOT_LEAK");
    expect(results.fetch).toBe("runtime-unavailable");
    expect(results.net).toBe("runtime-unavailable");
  }, 20_000);
});
